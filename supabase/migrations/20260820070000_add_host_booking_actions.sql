alter table public.bookings
  add column rejection_reason text
    check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  add column rejected_at timestamptz;

create or replace function public.manage_owned_booking(
  p_booking_id uuid,
  p_action text,
  p_reason text default null
)
returns table(booking_id uuid, booking_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_event_id uuid;
  v_outbox_event text;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  if p_action not in ('confirm', 'reject', 'cancel') then
    raise exception using errcode = '22023', message = 'Invalid booking action';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) > 1000 then
    raise exception using errcode = '22023', message = 'Booking reason is too long';
  end if;

  select * into v_booking
  from public.bookings booking
  where booking.id = p_booking_id and booking.user_id = v_user_id
  for update;

  if not found then raise exception 'Booking not found'; end if;

  if (p_action = 'confirm' and v_booking.status = 'confirmed')
    or (p_action = 'reject' and v_booking.status = 'rejected')
    or (p_action = 'cancel' and v_booking.status = 'cancelled') then
    return query select v_booking.id, v_booking.status;
    return;
  end if;

  v_event_id := v_booking.event_id;

  if p_action = 'confirm' then
    if v_booking.status <> 'pending' then
      raise exception using errcode = '22023', message = 'Only pending bookings can be confirmed';
    end if;

    update public.bookings
    set
      status = 'confirmed',
      provider_sync_status = 'pending',
      provider_sync_error = null
    where id = v_booking.id
    returning * into v_booking;
    v_outbox_event := 'booking.confirmed';

    insert into public.booking_audit_log (
      booking_id, user_id, action, actor_type, actor_label, data
    ) values (
      v_booking.id,
      v_user_id,
      'confirmed',
      'host',
      v_user_id::text,
      jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''))
    );
  elsif p_action = 'reject' then
    if v_booking.status <> 'pending' then
      raise exception using errcode = '22023', message = 'Only pending bookings can be rejected';
    end if;

    update public.bookings
    set
      status = 'rejected',
      rejection_reason = nullif(trim(coalesce(p_reason, '')), ''),
      rejected_at = now(),
      provider_sync_status = 'pending',
      provider_sync_error = null
    where id = v_booking.id
    returning * into v_booking;
    v_outbox_event := 'booking.rejected';

    insert into public.booking_audit_log (
      booking_id, user_id, action, actor_type, actor_label, data
    ) values (
      v_booking.id,
      v_user_id,
      'rejected',
      'host',
      v_user_id::text,
      jsonb_build_object('reason', v_booking.rejection_reason)
    );
  else
    if v_booking.status not in ('pending', 'confirmed') then
      raise exception using errcode = '22023', message = 'Booking can no longer be cancelled';
    end if;

    update public.bookings
    set
      status = 'cancelled',
      cancellation_reason = nullif(trim(coalesce(p_reason, '')), ''),
      cancelled_at = now(),
      cancelled_by = 'host',
      provider_sync_status = 'pending',
      provider_sync_error = null,
      ical_sequence = ical_sequence + 1
    where id = v_booking.id
    returning * into v_booking;
    v_outbox_event := 'booking.cancelled';

    insert into public.booking_audit_log (
      booking_id, user_id, action, actor_type, actor_label, data
    ) values (
      v_booking.id,
      v_user_id,
      'cancelled',
      'host',
      v_user_id::text,
      jsonb_build_object(
        'reason', v_booking.cancellation_reason,
        'icalSequence', v_booking.ical_sequence
      )
    );
  end if;

  insert into public.scheduling_outbox (
    booking_id, user_id, event_type, dedupe_key, payload
  ) values (
    v_booking.id,
    v_user_id,
    v_outbox_event,
    v_outbox_event || ':' || v_booking.uid::text || ':' || v_booking.ical_sequence::text,
    jsonb_build_object(
      'bookingUid', v_booking.uid,
      'status', v_booking.status,
      'icalSequence', v_booking.ical_sequence
    )
  ) on conflict (dedupe_key) do nothing;

  if p_action in ('reject', 'cancel') and v_event_id is not null then
    delete from public.events
    where id = v_event_id and user_id = v_user_id;
  end if;

  return query select v_booking.id, v_booking.status;
end;
$$;

revoke all on function public.manage_owned_booking(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.manage_owned_booking(uuid, text, text)
  to authenticated;