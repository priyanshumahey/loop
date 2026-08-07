-- Public scheduling: meeting types, availability, and guest bookings.
--
-- Ownership model: `scheduling_event_types` and `availability_slots` are
-- owner-scoped behind RLS. Anonymous visitors never touch those tables
-- directly; they call the SECURITY DEFINER RPCs at the bottom of this file,
-- which expose only what a booking page needs and enforce every rule server
-- side (notice period, booking window, slot alignment, buffers, conflicts).

-- Validates the `weekly_availability` jsonb: an array of at most 14
-- { dayOfWeek, startMinute, endMinute } rules with sane, ordered minutes.
create or replace function public.is_valid_weekly_availability(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $_$
declare
  rule jsonb;
  day_of_week integer;
  start_minute integer;
  end_minute integer;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > 14 then
    return false;
  end if;

  for rule in select * from jsonb_array_elements(value)
  loop
    if jsonb_typeof(rule) <> 'object'
      or coalesce(rule->>'dayOfWeek', '') !~ '^[0-6]$'
      or coalesce(rule->>'startMinute', '') !~ '^[0-9]{1,4}$'
      or coalesce(rule->>'endMinute', '') !~ '^[0-9]{1,4}$' then
      return false;
    end if;

    day_of_week := (rule->>'dayOfWeek')::integer;
    start_minute := (rule->>'startMinute')::integer;
    end_minute := (rule->>'endMinute')::integer;
    if day_of_week not between 0 and 6
      or start_minute not between 0 and 1439
      or end_minute not between 1 and 1440
      or end_minute <= start_minute then
      return false;
    end if;
  end loop;

  return true;
end;
$_$;

create table public.scheduling_event_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  slug text not null unique,
  description text,
  duration_minutes integer not null default 30
    check (duration_minutes between 5 and 480),
  buffer_before_minutes integer not null default 0
    check (buffer_before_minutes between 0 and 120),
  buffer_after_minutes integer not null default 0
    check (buffer_after_minutes between 0 and 120),
  min_notice_minutes integer not null default 0
    check (min_notice_minutes between 0 and 43200),
  booking_window_days integer not null default 14
    check (booking_window_days between 1 and 365),
  slot_increment_minutes integer not null default 15
    check (slot_increment_minutes in (5, 10, 15, 20, 30, 60)),
  location text check (location is null or char_length(location) <= 200),
  color text not null default 'emerald'
    check (color in ('sky', 'amber', 'violet', 'rose', 'emerald', 'orange')),
  -- The timezone the weekly rules below are expressed in.
  timezone text not null default 'UTC'
    check (char_length(timezone) between 1 and 100),
  weekly_availability jsonb not null default '[]'::jsonb
    check (public.is_valid_weekly_availability(weekly_availability)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, title)
);

create index scheduling_event_types_user_id_idx
  on public.scheduling_event_types(user_id);

alter table public.scheduling_event_types enable row level security;

create policy "Users can view own scheduling event types"
  on public.scheduling_event_types for select
  using (auth.uid() = user_id);

create policy "Users can insert own scheduling event types"
  on public.scheduling_event_types for insert
  with check (auth.uid() = user_id);

create policy "Users can update own scheduling event types"
  on public.scheduling_event_types for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own scheduling event types"
  on public.scheduling_event_types for delete
  using (auth.uid() = user_id);

create trigger scheduling_event_types_updated_at
  before update on public.scheduling_event_types
  for each row execute function public.handle_updated_at();

-- One-off openings painted on the schedule grid. A null event_type_id means
-- the window is open to every meeting type.
create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type_id uuid references public.scheduling_event_types(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_slots_valid_range check (end_time > start_time)
);

create index availability_slots_user_time_idx
  on public.availability_slots(user_id, start_time, end_time);
create index availability_slots_event_type_idx
  on public.availability_slots(user_id, event_type_id, start_time, end_time);

alter table public.availability_slots enable row level security;

create policy "Users can view own availability"
  on public.availability_slots for select
  using (auth.uid() = user_id);

create policy "Users can insert own availability"
  on public.availability_slots for insert
  with check (auth.uid() = user_id);

create policy "Users can update own availability"
  on public.availability_slots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own availability"
  on public.availability_slots for delete
  using (auth.uid() = user_id);

create trigger availability_slots_updated_at
  before update on public.availability_slots
  for each row execute function public.handle_updated_at();

-- Rows are written only by book_public_schedule (SECURITY DEFINER), so there
-- is deliberately no insert or delete policy for end users. The buffers are
-- copied from the meeting type at booking time so later edits to the meeting
-- type can't retroactively invalidate an existing booking.
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  event_type_id uuid references public.scheduling_event_types(id) on delete set null,
  event_id uuid not null unique references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  guest_name text not null,
  guest_email text not null,
  guest_notes text,
  -- Idempotency key from the booking form: a retry can't double-book.
  request_id uuid,
  buffer_before_minutes integer not null default 0
    check (buffer_before_minutes between 0 and 120),
  buffer_after_minutes integer not null default 0
    check (buffer_after_minutes between 0 and 120),
  status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bookings_user_id_idx on public.bookings(user_id);
create index bookings_event_type_id_idx on public.bookings(event_type_id);
create unique index bookings_request_id_idx
  on public.bookings(request_id) where request_id is not null;

alter table public.bookings enable row level security;

create policy "Users can view own bookings"
  on public.bookings for select
  using (auth.uid() = user_id);

create policy "Users can update own bookings"
  on public.bookings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function public.handle_updated_at();

-- The owner's own availability for the schedule grid: explicit slots plus the
-- weekly rules of every meeting type, expanded into concrete ranges. Runs as
-- the caller so RLS still applies.
create or replace function public.get_scheduling_availability(p_start_time timestamptz, p_end_time timestamptz)
returns table(id text, start_time timestamptz, end_time timestamptz, event_type_id uuid)
language sql
stable
set search_path = public
as $$
  with owned_types as (
    select event_type.id, event_type.timezone, event_type.weekly_availability
    from public.scheduling_event_types event_type
    where event_type.user_id = auth.uid()
  ),
  weekly_rules as (
    select event_type.id as event_type_id, event_type.timezone,
      rule."dayOfWeek", rule."startMinute", rule."endMinute"
    from owned_types event_type
    cross join lateral jsonb_to_recordset(event_type.weekly_availability)
      as rule("dayOfWeek" integer, "startMinute" integer, "endMinute" integer)
  ),
  local_days as (
    select rule.*, local_day
    from weekly_rules rule
    cross join lateral generate_series(
      (p_start_time at time zone rule.timezone)::date::timestamp,
      (p_end_time at time zone rule.timezone)::date::timestamp,
      interval '1 day'
    ) as generated(local_day)
  ),
  weekly_ranges as (
    select
      'weekly:' || day.event_type_id::text || ':' || day.local_day::date::text
        || ':' || day."startMinute"::text as id,
      (day.local_day + make_interval(mins => day."startMinute"))
        at time zone day.timezone as start_time,
      (day.local_day + make_interval(mins => day."endMinute"))
        at time zone day.timezone as end_time,
      day.event_type_id
    from local_days day
    where extract(dow from day.local_day)::integer = day."dayOfWeek"
  )
  select slot.id::text, slot.start_time, slot.end_time, slot.event_type_id
  from public.availability_slots slot
  where slot.user_id = auth.uid()
    and slot.start_time < p_end_time
    and slot.end_time > p_start_time
  union all
  select range.id, range.start_time, range.end_time, range.event_type_id
  from weekly_ranges range
  where range.start_time < p_end_time
    and range.end_time > p_start_time
  order by start_time;
$$;

-- Paint or erase a window on the schedule grid, merging overlapping slots when
-- opening and splitting them when closing.
create or replace function public.set_availability_range(
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_open boolean,
  p_event_type_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_slot public.availability_slots%rowtype;
  v_merged_start timestamptz := p_start_time;
  v_merged_end timestamptz := p_end_time;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'Availability end must be after start';
  end if;
  if p_event_type_id is not null and not exists (
    select 1 from public.scheduling_event_types
    where id = p_event_type_id and user_id = v_user_id
  ) then
    raise exception 'Meeting type not found';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  if p_open then
    select
      least(p_start_time, coalesce(min(start_time), p_start_time)),
      greatest(p_end_time, coalesce(max(end_time), p_end_time))
    into v_merged_start, v_merged_end
    from public.availability_slots
    where user_id = v_user_id
      and event_type_id is not distinct from p_event_type_id
      and start_time <= p_end_time
      and end_time >= p_start_time;

    delete from public.availability_slots
    where user_id = v_user_id
      and event_type_id is not distinct from p_event_type_id
      and start_time <= p_end_time
      and end_time >= p_start_time;

    insert into public.availability_slots (
      user_id, event_type_id, start_time, end_time
    ) values (
      v_user_id, p_event_type_id, v_merged_start, v_merged_end
    );
  else
    for v_slot in
      select *
      from public.availability_slots
      where user_id = v_user_id
        and event_type_id is not distinct from p_event_type_id
        and start_time < p_end_time
        and end_time > p_start_time
      for update
    loop
      delete from public.availability_slots where id = v_slot.id;

      if v_slot.start_time < p_start_time then
        insert into public.availability_slots (
          user_id, event_type_id, start_time, end_time
        ) values (
          v_user_id, p_event_type_id, v_slot.start_time, p_start_time
        );
      end if;

      if v_slot.end_time > p_end_time then
        insert into public.availability_slots (
          user_id, event_type_id, start_time, end_time
        ) values (
          v_user_id, p_event_type_id, p_end_time, v_slot.end_time
        );
      end if;
    end loop;
  end if;
end;
$$;

-- Everything below is reachable by anonymous visitors on /schedule/<slug>.

create or replace function public.get_public_event_type(p_slug text)
returns table(
  slug text,
  title text,
  description text,
  duration_minutes integer,
  location text,
  booking_window_days integer
)
language sql
stable
security definer
set search_path = public
as $$
  select event_type.slug, event_type.title, event_type.description,
    event_type.duration_minutes, event_type.location,
    event_type.booking_window_days
  from public.scheduling_event_types event_type
  where event_type.slug = p_slug and event_type.active = true
  limit 1;
$$;

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

create or replace function public.book_public_schedule(
  p_slug text,
  p_start_time timestamptz,
  p_guest_name text,
  p_guest_email text,
  p_request_id uuid,
  p_guest_notes text default null
)
returns table(booking_id uuid, event_id uuid, end_time timestamptz)
language plpgsql
security definer
set search_path = public
as $_$
declare
  v_event_type public.scheduling_event_types%rowtype;
  v_end_time timestamptz;
  v_event_id uuid;
  v_booking_id uuid;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'A booking request id is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_request_id::text));

  select booking.id, booking.event_id, event.end_time
  into v_booking_id, v_event_id, v_end_time
  from public.bookings booking
  join public.events event on event.id = booking.event_id
  where booking.request_id = p_request_id;

  if found then
    return query select v_booking_id, v_event_id, v_end_time;
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
    or char_length(trim(coalesce(p_guest_notes, ''))) > 1000 then
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
      and busy.start_time
        - make_interval(mins => coalesce(booking.buffer_before_minutes, 0))
        < v_end_time + make_interval(mins => v_event_type.buffer_after_minutes)
      and busy.end_time
        + make_interval(mins => coalesce(booking.buffer_after_minutes, 0))
        > p_start_time - make_interval(mins => v_event_type.buffer_before_minutes)
  ) then
    raise exception using errcode = '23P01', message = 'This time is no longer available';
  end if;

  insert into public.events (
    user_id, title, description, start_time, end_time, all_day, color,
    location, timezone, source
  ) values (
    v_event_type.user_id,
    v_event_type.title || ' with ' || trim(p_guest_name),
    concat_ws(E'\n',
      'Booked by ' || trim(p_guest_name) || ' <' || trim(p_guest_email) || '>',
      nullif(trim(coalesce(p_guest_notes, '')), '')
    ),
    p_start_time, v_end_time, false, v_event_type.color,
    v_event_type.location, v_event_type.timezone, 'local'
  ) returning id into v_event_id;

  insert into public.bookings (
    event_type_id, event_id, user_id, guest_name, guest_email, guest_notes,
    request_id, buffer_before_minutes, buffer_after_minutes
  ) values (
    v_event_type.id, v_event_id, v_event_type.user_id,
    trim(p_guest_name), lower(trim(p_guest_email)),
    nullif(trim(coalesce(p_guest_notes, '')), ''), p_request_id,
    v_event_type.buffer_before_minutes, v_event_type.buffer_after_minutes
  ) returning id into v_booking_id;

  return query select v_booking_id, v_event_id, v_end_time;
end;
$_$;

revoke all on function public.get_scheduling_availability(timestamptz, timestamptz) from public;
revoke all on function public.set_availability_range(timestamptz, timestamptz, boolean, uuid) from public;
revoke all on function public.get_public_event_type(text) from public;
revoke all on function public.get_public_schedule_slots(text, timestamptz, timestamptz) from public;
revoke all on function public.book_public_schedule(text, timestamptz, text, text, uuid, text) from public;

grant execute on function public.get_scheduling_availability(timestamptz, timestamptz) to authenticated;
grant execute on function public.set_availability_range(timestamptz, timestamptz, boolean, uuid) to authenticated;
grant execute on function public.get_public_event_type(text) to anon, authenticated;
grant execute on function public.get_public_schedule_slots(text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.book_public_schedule(text, timestamptz, text, text, uuid, text) to anon, authenticated;
