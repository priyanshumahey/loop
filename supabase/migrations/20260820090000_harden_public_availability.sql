-- Availability hardening: keep the local busy projection fresh for anonymous
-- bookers, ignore non-blocking bookings when computing slots, and cap runaway
-- bookings from a single guest address.

create table public.scheduling_availability_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_synced_at timestamptz not null default now(),
  window_start timestamptz not null,
  window_end timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.scheduling_availability_sync enable row level security;

create policy "Users can view own availability sync"
  on public.scheduling_availability_sync for select
  using (auth.uid() = user_id);

create trigger scheduling_availability_sync_updated_at
  before update on public.scheduling_availability_sync
  for each row execute function public.handle_updated_at();

-- Returns true only for the caller that wins the refresh slot, so concurrent
-- public requests never stampede the calendar provider.
create or replace function public.claim_availability_sync(
  p_user_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_max_age interval
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  if p_window_end <= p_window_start then
    raise exception 'Availability sync window must be positive';
  end if;

  insert into public.scheduling_availability_sync (
    user_id, last_synced_at, window_start, window_end
  ) values (
    p_user_id, now(), p_window_start, p_window_end
  )
  on conflict (user_id) do update
  set
    last_synced_at = now(),
    window_start = excluded.window_start,
    window_end = excluded.window_end
  where public.scheduling_availability_sync.last_synced_at
    <= now() - greatest(p_max_age, interval '0 seconds')
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_availability_sync(
  uuid, timestamptz, timestamptz, interval
) from public, anon, authenticated;
grant execute on function public.claim_availability_sync(
  uuid, timestamptz, timestamptz, interval
) to service_role;

-- Cancelled, rejected, and superseded bookings must never hold a slot.
create or replace function public.get_public_schedule_slots(
  p_slug text,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns table(start_time timestamptz, end_time timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event_type public.scheduling_event_types%rowtype;
  v_earliest timestamptz;
  v_latest timestamptz;
  v_step integer;
begin
  if p_end_time <= p_start_time or p_end_time > p_start_time + interval '31 days' then
    raise exception 'Schedule range must be between 1 minute and 31 days';
  end if;

  select * into v_event_type
  from public.scheduling_event_types
  where scheduling_event_types.slug = p_slug
    and scheduling_event_types.active = true;

  if not found then return; end if;

  v_step := v_event_type.slot_increment_minutes;
  v_earliest := greatest(
    p_start_time,
    now() + make_interval(mins => v_event_type.min_notice_minutes)
  );
  v_latest := least(
    p_end_time,
    now() + make_interval(days => v_event_type.booking_window_days)
  );

  if v_latest <= v_earliest then return; end if;

  return query
  with weekly_rules as (
    select rule."dayOfWeek", rule."startMinute", rule."endMinute"
    from jsonb_to_recordset(v_event_type.weekly_availability)
      as rule("dayOfWeek" integer, "startMinute" integer, "endMinute" integer)
  ),
  local_days as (
    select rule.*, local_day
    from weekly_rules rule
    cross join lateral generate_series(
      (v_earliest at time zone v_event_type.timezone)::date::timestamp,
      (v_latest at time zone v_event_type.timezone)::date::timestamp,
      interval '1 day'
    ) as generated(local_day)
  ),
  availability_ranges as (
    select slot.start_time as range_start, slot.end_time as range_end
    from public.availability_slots slot
    where slot.user_id = v_event_type.user_id
      and (slot.event_type_id is null or slot.event_type_id = v_event_type.id)
      and slot.start_time < v_latest
      and slot.end_time > v_earliest
    union all
    select
      (day.local_day + make_interval(mins => day."startMinute"))
        at time zone v_event_type.timezone,
      (day.local_day + make_interval(mins => day."endMinute"))
        at time zone v_event_type.timezone
    from local_days day
    where extract(dow from day.local_day)::integer = day."dayOfWeek"
  ),
  candidates as (
    select generated.candidate_start
    from availability_ranges availability
    cross join lateral generate_series(
      availability.range_start
        + ceil(
            extract(epoch from greatest(availability.range_start, v_earliest)
              - availability.range_start) / (v_step * 60)
          )::double precision * make_interval(mins => v_step),
      least(availability.range_end, v_latest)
        - make_interval(mins => v_event_type.duration_minutes),
      make_interval(mins => v_step)
    ) as generated(candidate_start)
  )
  select distinct
    candidate.candidate_start,
    candidate.candidate_start
      + make_interval(mins => v_event_type.duration_minutes)
  from candidates candidate
  where not exists (
    select 1
    from public.events busy
    left join public.bookings booking on booking.event_id = busy.id
    where busy.user_id = v_event_type.user_id
      and (booking.id is null or booking.status in ('pending', 'confirmed'))
      and busy.start_time
        - make_interval(mins => coalesce(booking.buffer_before_minutes, 0))
        < candidate.candidate_start
          + make_interval(
              mins => v_event_type.duration_minutes
                + v_event_type.buffer_after_minutes
            )
      and busy.end_time
        + make_interval(mins => coalesce(booking.buffer_after_minutes, 0))
        > candidate.candidate_start
          - make_interval(mins => v_event_type.buffer_before_minutes)
  )
  order by candidate.candidate_start
  limit 500;
end;
$$;

revoke all on function public.get_public_schedule_slots(text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_public_schedule_slots(text, timestamptz, timestamptz)
  to anon, authenticated;

-- Bounds how much of a host's future calendar one guest address can hold at once.
create or replace function public.enforce_booker_active_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_active integer;
begin
  if new.status not in ('pending', 'confirmed') then return new; end if;

  select count(*) into v_active
  from public.bookings booking
  where booking.user_id = new.user_id
    and lower(booking.guest_email) = lower(new.guest_email)
    and booking.status in ('pending', 'confirmed')
    and booking.end_time > now();

  if v_active >= 20 then
    raise exception using
      errcode = '23505',
      message = 'Too many active bookings for this email address';
  end if;

  return new;
end;
$$;

create trigger bookings_enforce_booker_limit
  before insert on public.bookings
  for each row execute function public.enforce_booker_active_limit();

revoke all on function public.enforce_booker_active_limit()
  from public, anon, authenticated;
