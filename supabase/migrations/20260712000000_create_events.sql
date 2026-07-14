create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '(no title)',
  description text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  all_day boolean not null default false,
  color text default 'sky' check (color in ('sky', 'amber', 'violet', 'rose', 'emerald', 'orange')),
  location text,
  -- IANA timezone the event was authored in (e.g. 'America/New_York').
  timezone text,
  -- Google Calendar sync linkage.
  google_event_id text,
  google_calendar_id text not null default 'primary',
  etag text,
  source text not null default 'local' check (source in ('local', 'google')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_time_range check (end_time >= start_time)
);

-- Query patterns: by user, and by user within a time window.
create index events_user_id_idx on public.events(user_id);
create index events_user_time_idx on public.events(user_id, start_time, end_time);

-- One local row per Google event (per calendar). Partial so many local-only
-- rows (google_event_id null) can coexist. Used to reconcile pulls.
create unique index events_google_unique_idx
  on public.events(user_id, google_calendar_id, google_event_id)
  where google_event_id is not null;

alter table public.events enable row level security;

create policy "Users can view own events"
  on public.events for select
  using (auth.uid() = user_id);

create policy "Users can insert own events"
  on public.events for insert
  with check (auth.uid() = user_id);

create policy "Users can update own events"
  on public.events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own events"
  on public.events for delete
  using (auth.uid() = user_id);

-- Reuses public.handle_updated_at() defined in the oauth_tokens migration.
create trigger events_updated_at
  before update on public.events
  for each row execute function public.handle_updated_at();
