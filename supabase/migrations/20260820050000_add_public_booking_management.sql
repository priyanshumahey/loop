create or replace function public.get_public_booking(
  p_uid uuid,
  p_management_token text
)
returns table(
  booking_uid uuid,
  event_type_slug text,
  title text,
  description text,
  start_time timestamptz,
  end_time timestamptz,
  location text,
  locations jsonb,
  timezone text,
  status text,
  guest_name text,
  guest_email text,
  can_cancel boolean,
  can_reschedule boolean,
  minimum_reschedule_notice_minutes integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    booking.uid,
    coalesce(
      booking.event_type_snapshot->>'slug',
      event_type.slug
    ),
    booking.title,
    booking.description,
    booking.start_time,
    booking.end_time,
    booking.location,
    coalesce(
      booking.event_type_snapshot->'locations',
      event_type.locations,
      '[]'::jsonb
    ),
    booking.timezone,
    booking.status,
    booking.guest_name,
    booking.guest_email,
    booking.status in ('pending', 'confirmed')
      and booking.start_time > now()
      and coalesce(
        booking.event_type_snapshot->>'disableCancelling',
        event_type.disable_cancelling::text,
        'false'
      ) <> 'true',
    booking.status in ('pending', 'confirmed')
      and booking.start_time > now()
        + make_interval(
            mins => coalesce(
              (booking.event_type_snapshot->>'minimumRescheduleNoticeMinutes')::integer,
              event_type.minimum_reschedule_notice_minutes,
              0
            )
          )
      and coalesce(
        booking.event_type_snapshot->>'disableRescheduling',
        event_type.disable_rescheduling::text,
        'false'
      ) <> 'true',
    coalesce(
      (booking.event_type_snapshot->>'minimumRescheduleNoticeMinutes')::integer,
      event_type.minimum_reschedule_notice_minutes,
      0
    )
  from public.bookings booking
  left join public.scheduling_event_types event_type
    on event_type.id = booking.event_type_id
  where booking.uid = p_uid
    and char_length(coalesce(p_management_token, '')) between 32 and 256
    and booking.management_token_hash =
      public.hash_booking_management_token(p_management_token)
  limit 1;
$$;

create or replace function public.cancel_public_booking(
  p_uid uuid,
  p_management_token text,
  p_reason text default null
)
returns table(booking_uid uuid, booking_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_disable_cancelling boolean;
  v_event_id uuid;
begin
  if char_length(trim(coalesce(p_reason, ''))) > 1000 then
    raise exception using errcode = '22023', message = 'Cancellation reason is too long';
  end if;

  select * into v_booking
  from public.bookings booking
  where booking.uid = p_uid
    and char_length(coalesce(p_management_token, '')) between 32 and 256
    and booking.management_token_hash =
      public.hash_booking_management_token(p_management_token)
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Booking not found';
  end if;
  if v_booking.status = 'cancelled' then
    return query select v_booking.uid, v_booking.status;
    return;
  end if;
  if v_booking.status not in ('pending', 'confirmed')
    or v_booking.start_time <= now() then
    raise exception using errcode = '22023', message = 'Booking can no longer be cancelled';
  end if;

  v_disable_cancelling := coalesce(
    (v_booking.event_type_snapshot->>'disableCancelling')::boolean,
    false
  );
  if v_disable_cancelling then
    raise exception using errcode = '22023', message = 'Cancellation is disabled for this booking';
  end if;

  v_event_id := v_booking.event_id;
  update public.bookings
  set
    status = 'cancelled',
    cancellation_reason = nullif(trim(coalesce(p_reason, '')), ''),
    cancelled_at = now(),
    cancelled_by = 'guest',
    provider_sync_status = 'pending',
    provider_sync_error = null,
    ical_sequence = ical_sequence + 1
  where id = v_booking.id
  returning * into v_booking;

  insert into public.booking_audit_log (
    booking_id, user_id, action, actor_type, actor_label, data
  ) values (
    v_booking.id,
    v_booking.user_id,
    'cancelled',
    'guest',
    v_booking.guest_email,
    jsonb_build_object(
      'reason', v_booking.cancellation_reason,
      'icalSequence', v_booking.ical_sequence
    )
  );

  insert into public.scheduling_outbox (
    booking_id, user_id, event_type, dedupe_key, payload
  ) values (
    v_booking.id,
    v_booking.user_id,
    'booking.cancelled',
    'booking.cancelled:' || v_booking.uid::text || ':' || v_booking.ical_sequence::text,
    jsonb_build_object(
      'bookingUid', v_booking.uid,
      'icalSequence', v_booking.ical_sequence
    )
  ) on conflict (dedupe_key) do nothing;

  if v_event_id is not null then
    delete from public.events
    where id = v_event_id and user_id = v_booking.user_id;
  end if;

  return query select v_booking.uid, v_booking.status;
end;
$$;

revoke all on function public.get_public_booking(uuid, text)
  from public, anon, authenticated;
revoke all on function public.cancel_public_booking(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.get_public_booking(uuid, text)
  to anon, authenticated;
grant execute on function public.cancel_public_booking(uuid, text, text)
  to anon, authenticated;