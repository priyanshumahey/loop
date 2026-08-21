create or replace function public.reschedule_public_booking(
  p_uid uuid,
  p_management_token text,
  p_start_time timestamptz,
  p_request_id uuid,
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
as $$
declare
  v_original public.bookings%rowtype;
  v_event_type public.scheduling_event_types%rowtype;
  v_end_time timestamptz;
  v_event_id uuid;
  v_booking_id uuid;
  v_booking_uid uuid;
  v_management_token text;
  v_management_token_hash text;
  v_booking_status text;
  v_minimum_notice integer;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'A booking request id is required';
  end if;
  if char_length(trim(p_guest_timezone)) not between 1 and 100
    or (
      p_guest_locale is not null
      and char_length(trim(p_guest_locale)) not between 2 and 35
    ) then
    raise exception using errcode = '22023', message = 'Valid guest details are required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_request_id::text));

  select * into v_original
  from public.bookings booking
  where booking.uid = p_uid
    and char_length(coalesce(p_management_token, '')) between 32 and 256
    and booking.management_token_hash =
      public.hash_booking_management_token(p_management_token)
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Booking not found';
  end if;

  select
    booking.id,
    booking.uid,
    booking.event_id,
    booking.end_time,
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
  where booking.request_id = p_request_id
    and booking.rescheduled_from_id = v_original.id;

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

  if v_original.status not in ('pending', 'confirmed')
    or v_original.start_time <= now() then
    raise exception using errcode = '22023', message = 'Booking can no longer be rescheduled';
  end if;
  if coalesce(
    (v_original.event_type_snapshot->>'disableRescheduling')::boolean,
    false
  ) then
    raise exception using errcode = '22023', message = 'Rescheduling is disabled for this booking';
  end if;

  v_minimum_notice := coalesce(
    (v_original.event_type_snapshot->>'minimumRescheduleNoticeMinutes')::integer,
    0
  );
  if v_original.start_time <= now() + make_interval(mins => v_minimum_notice) then
    raise exception using errcode = '22023', message = 'Booking can no longer be rescheduled';
  end if;

  select * into v_event_type
  from public.scheduling_event_types event_type
  where event_type.id = v_original.event_type_id
    and event_type.user_id = v_original.user_id
    and event_type.active = true;

  if not found then
    raise exception using errcode = 'P0002', message = 'Schedule not found';
  end if;
  if p_start_time < now() + make_interval(mins => v_event_type.min_notice_minutes) then
    raise exception using errcode = '22007', message = 'This time is no longer available';
  end if;
  if p_start_time > now() + make_interval(days => v_event_type.booking_window_days) then
    raise exception using errcode = '22007', message = 'This time is outside the booking window';
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
      and busy.id is distinct from v_original.event_id
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
    v_event_type.title || ' with ' || v_original.guest_name,
    concat_ws(E'\n',
      'Booked by ' || v_original.guest_name || ' <' || v_original.guest_email || '>',
      v_original.guest_notes
    ),
    p_start_time, v_end_time, false, v_event_type.color,
    v_event_type.location, v_event_type.timezone, 'local'
  ) returning id into v_event_id;

  insert into public.bookings (
    event_type_id,
    event_id,
    user_id,
    uid,
    title,
    description,
    start_time,
    end_time,
    location,
    timezone,
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
    rescheduled_from_id,
    ical_uid,
    ical_sequence
  ) values (
    v_event_type.id,
    v_event_id,
    v_event_type.user_id,
    v_booking_uid,
    v_event_type.title || ' with ' || v_original.guest_name,
    v_event_type.description,
    p_start_time,
    v_end_time,
    v_event_type.location,
    v_event_type.timezone,
    v_original.guest_name,
    v_original.guest_email,
    v_original.guest_notes,
    trim(p_guest_timezone),
    nullif(trim(coalesce(p_guest_locale, '')), ''),
    v_original.responses,
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
    v_original.id,
    v_original.ical_uid,
    v_original.ical_sequence + 1
  ) returning id into v_booking_id;

  insert into public.booking_attendees (
    booking_id, name, email, timezone, locale
  )
  select
    v_booking_id,
    attendee.name,
    attendee.email,
    trim(p_guest_timezone),
    coalesce(nullif(trim(coalesce(p_guest_locale, '')), ''), attendee.locale)
  from public.booking_attendees attendee
  where attendee.booking_id = v_original.id;

  if not found then
    insert into public.booking_attendees (
      booking_id, name, email, timezone, locale
    ) values (
      v_booking_id,
      v_original.guest_name,
      v_original.guest_email,
      trim(p_guest_timezone),
      nullif(trim(coalesce(p_guest_locale, '')), '')
    );
  end if;

  update public.bookings
  set
    status = 'rescheduled',
    rescheduled_at = now(),
    provider_sync_error = null,
    ical_sequence = ical_sequence + 1
  where id = v_original.id;

  insert into public.booking_audit_log (
    booking_id, user_id, action, actor_type, actor_label, data
  ) values
  (
    v_original.id,
    v_original.user_id,
    'rescheduled',
    'guest',
    v_original.guest_email,
    jsonb_build_object(
      'toBookingId', v_booking_id,
      'toBookingUid', v_booking_uid,
      'startTime', p_start_time,
      'endTime', v_end_time
    )
  ),
  (
    v_booking_id,
    v_original.user_id,
    'created',
    'guest',
    v_original.guest_email,
    jsonb_build_object(
      'fromBookingId', v_original.id,
      'fromBookingUid', v_original.uid,
      'status', v_booking_status
    )
  );

  insert into public.scheduling_outbox (
    booking_id, user_id, event_type, dedupe_key, payload
  ) values (
    v_booking_id,
    v_original.user_id,
    'booking.rescheduled',
    'booking.rescheduled:' || v_booking_uid::text,
    jsonb_build_object(
      'bookingUid', v_booking_uid,
      'fromBookingId', v_original.id,
      'fromBookingUid', v_original.uid,
      'status', v_booking_status
    )
  );

  if v_original.event_id is not null then
    delete from public.events
    where id = v_original.event_id and user_id = v_original.user_id;
  end if;

  return query select
    v_booking_id,
    v_booking_uid,
    v_management_token,
    v_event_id,
    v_end_time,
    v_booking_status;
end;
$$;

revoke all on function public.reschedule_public_booking(
  uuid, text, timestamptz, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.reschedule_public_booking(
  uuid, text, timestamptz, uuid, text, text
) to anon, authenticated;