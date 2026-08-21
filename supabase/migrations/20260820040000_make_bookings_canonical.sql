alter table public.bookings
  add column title text,
  add column description text,
  add column start_time timestamptz,
  add column end_time timestamptz,
  add column location text,
  add column timezone text;

update public.bookings booking
set
  title = event.title,
  description = event.description,
  start_time = event.start_time,
  end_time = event.end_time,
  location = event.location,
  timezone = coalesce(event.timezone, 'UTC')
from public.events event
where event.id = booking.event_id;

alter table public.bookings
  alter column title set not null,
  alter column start_time set not null,
  alter column end_time set not null,
  alter column timezone set not null,
  add constraint bookings_valid_time_range check (end_time > start_time),
  add constraint bookings_timezone_length_check
    check (char_length(timezone) between 1 and 100);

create index bookings_user_time_idx
  on public.bookings(user_id, start_time, end_time);
create index bookings_active_time_idx
  on public.bookings(user_id, start_time, end_time)
  where status in ('pending', 'confirmed');

create or replace function public.populate_booking_from_event()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event public.events%rowtype;
begin
  if new.event_id is not null then
    select * into v_event
    from public.events
    where id = new.event_id and user_id = new.user_id;

    if not found then raise exception 'Booking event not found'; end if;

    new.title := coalesce(new.title, v_event.title);
    new.description := coalesce(new.description, v_event.description);
    new.start_time := coalesce(new.start_time, v_event.start_time);
    new.end_time := coalesce(new.end_time, v_event.end_time);
    new.location := coalesce(new.location, v_event.location);
    new.timezone := coalesce(new.timezone, v_event.timezone, 'UTC');
  end if;

  if new.title is null or new.start_time is null or new.end_time is null then
    raise exception 'Booking title and time are required';
  end if;
  new.timezone := coalesce(new.timezone, 'UTC');
  return new;
end;
$$;

create trigger bookings_populate_from_event
  before insert on public.bookings
  for each row execute function public.populate_booking_from_event();

create or replace function public.sync_booking_from_event()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.bookings
  set
    title = new.title,
    description = new.description,
    start_time = new.start_time,
    end_time = new.end_time,
    location = new.location,
    timezone = coalesce(new.timezone, 'UTC')
  where event_id = new.id
    and user_id = new.user_id
    and status in ('pending', 'confirmed');
  return new;
end;
$$;

create trigger events_sync_linked_booking
  after update of title, description, start_time, end_time, location, timezone
  on public.events
  for each row execute function public.sync_booking_from_event();

revoke all on function public.populate_booking_from_event()
  from public, anon, authenticated;
revoke all on function public.sync_booking_from_event()
  from public, anon, authenticated;