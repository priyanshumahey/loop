-- Read-only public calendar links.
--
-- A share is an opaque 32-hex token plus the limits the owner set: a date
-- range, which weekdays are visible, and whether event titles are revealed.
-- Anonymous visitors never read `events` directly; the SECURITY DEFINER RPCs
-- below apply every limit in Postgres, so a redacted title is redacted in the
-- response and not merely hidden by the UI.

create table public.calendar_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  name text not null default 'Shared calendar'
    check (char_length(trim(name)) between 1 and 80),
  view text not null default 'week'
    check (view in ('week', 'month', 'agenda')),
  show_event_names boolean not null default false,
  start_date date not null default current_date,
  end_date date not null default (current_date + 29),
  visible_weekdays smallint[] not null
    default array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    check (
      cardinality(visible_weekdays) between 1 and 7
      and visible_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    ),
  timezone text not null default 'UTC'
    check (char_length(timezone) between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_shares_date_range_check
    check (end_date >= start_date and end_date <= start_date + 365)
);

create index calendar_shares_user_id_idx on public.calendar_shares(user_id);

alter table public.calendar_shares enable row level security;

create policy "Users can view own calendar shares"
  on public.calendar_shares for select
  using (auth.uid() = user_id);

create policy "Users can insert own calendar shares"
  on public.calendar_shares for insert
  with check (auth.uid() = user_id);

create policy "Users can update own calendar shares"
  on public.calendar_shares for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own calendar shares"
  on public.calendar_shares for delete
  using (auth.uid() = user_id);

create trigger calendar_shares_updated_at
  before update on public.calendar_shares
  for each row execute function public.handle_updated_at();

create or replace function public.get_public_calendar_share(p_token text)
returns table(
  name text,
  view text,
  show_event_names boolean,
  start_date date,
  end_date date,
  visible_weekdays smallint[],
  timezone text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    share.name,
    share.view,
    share.show_event_names,
    share.start_date,
    share.end_date,
    share.visible_weekdays,
    share.timezone
  from public.calendar_shares share
  where share.token = p_token and share.active = true
  limit 1;
$$;

-- Events inside a share's window, sliced per visible local day so an event
-- spanning a hidden weekday can't leak through, and with titles redacted in
-- SQL when the owner didn't opt into showing names.
create or replace function public.get_public_calendar_events(
  p_token text,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns table(
  id uuid,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  all_day boolean,
  color text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_share public.calendar_shares%rowtype;
begin
  if p_end_time <= p_start_time
    or p_end_time > p_start_time + interval '62 days' then
    raise exception 'Calendar range must be between 1 minute and 62 days';
  end if;

  select * into v_share
  from public.calendar_shares
  where calendar_shares.token = p_token
    and calendar_shares.active = true;

  if not found then
    return;
  end if;

  return query
  select
    event.id,
    case when v_share.show_event_names then event.title else 'Blocked' end,
    greatest(
      event.start_time,
      visible_day.day::timestamp at time zone v_share.timezone,
      p_start_time
    ),
    least(
      event.end_time,
      (visible_day.day + interval '1 day')::timestamp at time zone v_share.timezone,
      p_end_time
    ),
    event.all_day,
    event.color
  from public.events event
  cross join lateral generate_series(
    greatest(
      v_share.start_date,
      (p_start_time at time zone v_share.timezone)::date,
      (event.start_time at time zone v_share.timezone)::date
    ),
    least(
      v_share.end_date,
      ((p_end_time - interval '1 microsecond') at time zone v_share.timezone)::date,
      ((event.end_time - interval '1 microsecond') at time zone v_share.timezone)::date
    ),
    interval '1 day'
  ) as visible_day(day)
  where event.user_id = v_share.user_id
    and event.start_time < p_end_time
    and event.end_time > p_start_time
    and extract(dow from visible_day.day)::smallint = any(v_share.visible_weekdays)
  order by 3;
end;
$$;

revoke all on function public.get_public_calendar_share(text) from public;
revoke all on function public.get_public_calendar_events(text, timestamptz, timestamptz) from public;

grant execute on function public.get_public_calendar_share(text) to anon, authenticated;
grant execute on function public.get_public_calendar_events(text, timestamptz, timestamptz) to anon, authenticated;
