create or replace function public.hash_booking_management_token(value text)
returns text
language sql
immutable
strict
set search_path = public, extensions
as $$
  select encode(extensions.digest(value, 'sha256'), 'hex');
$$;

revoke all on function public.hash_booking_management_token(text)
  from public, anon, authenticated;

drop function public.book_public_schedule(
  text, timestamptz, text, text, uuid, text
);

create or replace function public.book_public_schedule(
  p_slug text,
  p_start_time timestamptz,
  p_guest_name text,
  p_guest_email text,
  p_request_id uuid,
  p_guest_notes text default null,
  p_guest_timezone text default 'UTC',
  p_guest_locale text default null
)
returns table(
  booking_id uuid,
  booking_uid uuid,
  management_token text,
  event_id uuid,
  end_time timestamptz,
  booking_status text
)
language plpgsql
security definer
set search_path = public, extensions
as $_$
declare
  v_event_type public.scheduling_event_types%rowtype;
  v_end_time timestamptz;
  v_event_id uuid;
  v_booking_id uuid;
  v_booking_uid uuid;
  v_management_token text;
  v_management_token_hash text;
  v_booking_status text;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'A booking request id is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_request_id::text));

  select
    booking.id,
    booking.uid,
    booking.event_id,
    event.end_time,
    booking.status,
    encode(
      extensions.digest(
        booking.request_id::text || ':' || booking.uid::text,
        'sha256'
      ),
      'hex'
    )
  into
    v_booking_id,
    v_booking_uid,
    v_event_id,
    v_end_time,
    v_booking_status,
    v_management_token
  from public.bookings booking
  left join public.events event on event.id = booking.event_id
  where booking.request_id = p_request_id;

  if found then
    if public.hash_booking_management_token(v_management_token) <> (
      select booking.management_token_hash
      from public.bookings booking
      where booking.id = v_booking_id
    ) then
      v_management_token := null;
    end if;

    return query select
      v_booking_id,
      v_booking_uid,
      v_management_token,
      v_event_id,
      v_end_time,
      v_booking_status;
    return;
  end if;

  select * into v_event_type
  from public.scheduling_event_types
  where scheduling_event_types.slug = p_slug
    and scheduling_event_types.active = true;

  if not found then
    raise exception using errcode = 'P0002', message = 'Schedule not found';
  end if;
  if p_start_time < now() + make_interval(mins => v_event_type.min_notice_minutes) then
    raise exception using errcode = '22007', message = 'This time is no longer available';
  end if;
  if p_start_time > now() + make_interval(days => v_event_type.booking_window_days) then
    raise exception using errcode = '22007', message = 'This time is outside the booking window';
  end if;
  if char_length(trim(p_guest_name)) not between 1 and 120
    or char_length(trim(p_guest_email)) not between 3 and 320
    or trim(p_guest_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(trim(coalesce(p_guest_notes, ''))) > 1000
    or char_length(trim(p_guest_timezone)) not between 1 and 100
    or (
      p_guest_locale is not null
      and char_length(trim(p_guest_locale)) not between 2 and 35
    ) then
    raise exception using errcode = '22023', message = 'Valid guest details are required';
  end if;

  v_end_time := p_start_time
    + make_interval(mins => v_event_type.duration_minutes);

  perform pg_advisory_xact_lock(hashtext(v_event_type.user_id::text));

  if not exists (
    with weekly_rules as (
      select rule."dayOfWeek", rule."startMinute", rule."endMinute"
      from jsonb_to_recordset(v_event_type.weekly_availability)
        as rule("dayOfWeek" integer, "startMinute" integer, "endMinute" integer)
    ),
    local_day as (
      select (p_start_time at time zone v_event_type.timezone)::date::timestamp as value
    ),
    availability_ranges as (
      select slot.start_time as range_start, slot.end_time as range_end
      from public.availability_slots slot
      where slot.user_id = v_event_type.user_id
        and (slot.event_type_id is null or slot.event_type_id = v_event_type.id)
        and slot.start_time <= p_start_time
        and slot.end_time >= v_end_time
      union all
      select
        (day.value + make_interval(mins => rule."startMinute"))
          at time zone v_event_type.timezone,
        (day.value + make_interval(mins => rule."endMinute"))
          at time zone v_event_type.timezone
      from local_day day
      join weekly_rules rule
        on rule."dayOfWeek" = extract(dow from day.value)::integer
    )
    select 1
    from availability_ranges availability
    where availability.range_start <= p_start_time
      and availability.range_end >= v_end_time
      and mod(
        extract(epoch from p_start_time - availability.range_start)::bigint,
        v_event_type.slot_increment_minutes * 60
      ) = 0
  ) then
    raise exception using errcode = '23P01', message = 'This time is no longer available';
  end if;

  if exists (
    select 1
    from public.events busy
    left join public.bookings booking on booking.event_id = busy.id
    where busy.user_id = v_event_type.user_id
      and (booking.id is null or booking.status in ('pending', 'confirmed'))
      and busy.start_time
        - make_interval(mins => coalesce(booking.buffer_before_minutes, 0))
        < v_end_time + make_interval(mins => v_event_type.buffer_after_minutes)
      and busy.end_time
        + make_interval(mins => coalesce(booking.buffer_after_minutes, 0))
        > p_start_time - make_interval(mins => v_event_type.buffer_before_minutes)
  ) then
    raise exception using errcode = '23P01', message = 'This time is no longer available';
  end if;

  v_booking_uid := gen_random_uuid();
  v_management_token := encode(
    extensions.digest(
      p_request_id::text || ':' || v_booking_uid::text,
      'sha256'
    ),
    'hex'
  );
  v_management_token_hash := public.hash_booking_management_token(
    v_management_token
  );
  v_booking_status := case
    when v_event_type.requires_confirmation then 'pending'
    else 'confirmed'
  end;

  insert into public.events (
    user_id, title, description, start_time, end_time, all_day, color,
    location, timezone, source
  ) values (
    v_event_type.user_id,
    v_event_type.title || ' with ' || trim(p_guest_name),
    concat_ws(E'\n',
      'Booked by ' || trim(p_guest_name) || ' <' || lower(trim(p_guest_email)) || '>',
      nullif(trim(coalesce(p_guest_notes, '')), '')
    ),
    p_start_time, v_end_time, false, v_event_type.color,
    v_event_type.location, v_event_type.timezone, 'local'
  ) returning id into v_event_id;

  insert into public.bookings (
    event_type_id,
    event_id,
    user_id,
    uid,
    guest_name,
    guest_email,
    guest_notes,
    guest_timezone,
    guest_locale,
    responses,
    event_type_snapshot,
    request_id,
    management_token_hash,
    buffer_before_minutes,
    buffer_after_minutes,
    status,
    ical_uid
  ) values (
    v_event_type.id,
    v_event_id,
    v_event_type.user_id,
    v_booking_uid,
    trim(p_guest_name),
    lower(trim(p_guest_email)),
    nullif(trim(coalesce(p_guest_notes, '')), ''),
    trim(p_guest_timezone),
    nullif(trim(coalesce(p_guest_locale, '')), ''),
    jsonb_build_object(
      'name', trim(p_guest_name),
      'email', lower(trim(p_guest_email)),
      'notes', nullif(trim(coalesce(p_guest_notes, '')), '')
    ),
    jsonb_build_object(
      'id', v_event_type.id,
      'slug', v_event_type.slug,
      'title', v_event_type.title,
      'description', v_event_type.description,
      'durationMinutes', v_event_type.duration_minutes,
      'locations', v_event_type.locations,
      'timezone', v_event_type.timezone,
      'destinationCalendarId', v_event_type.destination_calendar_id,
      'requiresConfirmation', v_event_type.requires_confirmation,
      'disableCancelling', v_event_type.disable_cancelling,
      'disableRescheduling', v_event_type.disable_rescheduling,
      'minimumRescheduleNoticeMinutes',
        v_event_type.minimum_reschedule_notice_minutes
    ),
    p_request_id,
    v_management_token_hash,
    v_event_type.buffer_before_minutes,
    v_event_type.buffer_after_minutes,
    v_booking_status,
    v_booking_uid::text || '@loop'
  ) returning id into v_booking_id;

  insert into public.booking_attendees (
    booking_id, name, email, timezone, locale
  ) values (
    v_booking_id,
    trim(p_guest_name),
    lower(trim(p_guest_email)),
    trim(p_guest_timezone),
    nullif(trim(coalesce(p_guest_locale, '')), '')
  );

  insert into public.booking_audit_log (
    booking_id, user_id, action, actor_type, actor_label,
    data
  ) values (
    v_booking_id,
    v_event_type.user_id,
    'created',
    'guest',
    lower(trim(p_guest_email)),
    jsonb_build_object('status', v_booking_status)
  );

  if v_booking_status = 'confirmed' then
    insert into public.booking_audit_log (
      booking_id, user_id, action, actor_type, data
    ) values (
      v_booking_id,
      v_event_type.user_id,
      'confirmed',
      'system',
      jsonb_build_object('reason', 'event_type_auto_confirmation')
    );
  end if;

  insert into public.scheduling_outbox (
    booking_id, user_id, event_type, dedupe_key, payload
  ) values (
    v_booking_id,
    v_event_type.user_id,
    'booking.created',
    'booking.created:' || v_booking_uid::text,
    jsonb_build_object(
      'bookingUid', v_booking_uid,
      'status', v_booking_status
    )
  );

  return query select
    v_booking_id,
    v_booking_uid,
    v_management_token,
    v_event_id,
    v_end_time,
    v_booking_status;
end;
$_$;

revoke all on function public.book_public_schedule(
  text, timestamptz, text, text, uuid, text, text, text
) from public;
grant execute on function public.book_public_schedule(
  text, timestamptz, text, text, uuid, text, text, text
) to anon, authenticated;