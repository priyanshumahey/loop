-- Scheduling lifecycle foundation, adapted from Cal.diy's domain boundaries.
-- Event types own booking policy; bookings remain durable when calendar events
-- disappear; attendees, provider references, audit entries, and side effects
-- have independent lifecycles.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.is_valid_scheduling_locations(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  location jsonb;
  location_type text;
  location_value text;
begin
  if jsonb_typeof(value) <> 'array'
    or jsonb_array_length(value) < 1
    or jsonb_array_length(value) > 5 then
    return false;
  end if;

  for location in select * from jsonb_array_elements(value)
  loop
    if jsonb_typeof(location) <> 'object' then return false; end if;
    location_type := coalesce(location->>'type', '');
    location_value := trim(coalesce(location->>'value', ''));

    if location_type not in ('google_meet', 'link', 'phone', 'in_person') then
      return false;
    end if;
    if location_type <> 'google_meet'
      and char_length(location_value) not between 1 and 500 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.is_valid_booking_fields(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  field jsonb;
  field_id text;
  field_type text;
  field_ids text[] := array[]::text[];
begin
  if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > 20 then
    return false;
  end if;

  for field in select * from jsonb_array_elements(value)
  loop
    if jsonb_typeof(field) <> 'object' then return false; end if;
    field_id := coalesce(field->>'id', '');
    field_type := coalesce(field->>'type', '');

    if field_id !~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'
      or field_id = any(field_ids)
      or char_length(trim(coalesce(field->>'label', ''))) not between 1 and 120
      or field_type not in (
        'text', 'textarea', 'phone', 'number', 'select', 'multiselect',
        'checkbox', 'radio', 'url'
      ) then
      return false;
    end if;
    if field ? 'required' and jsonb_typeof(field->'required') <> 'boolean' then
      return false;
    end if;
    if field_type in ('select', 'multiselect', 'radio') and (
      jsonb_typeof(field->'options') <> 'array'
      or jsonb_array_length(field->'options') not between 1 and 50
    ) then
      return false;
    end if;

    field_ids := array_append(field_ids, field_id);
  end loop;

  return true;
end;
$$;

alter table public.scheduling_event_types
  add column locations jsonb not null
    default '[{"type":"google_meet"}]'::jsonb,
  add column booking_fields jsonb not null default '[]'::jsonb,
  add column requires_confirmation boolean not null default false,
  add column disable_cancelling boolean not null default false,
  add column disable_rescheduling boolean not null default false,
  add column minimum_reschedule_notice_minutes integer not null default 0
    check (minimum_reschedule_notice_minutes between 0 and 43200),
  add column destination_calendar_id text not null default 'primary'
    check (char_length(destination_calendar_id) between 1 and 1024),
  add column success_redirect_url text
    check (success_redirect_url is null or char_length(success_redirect_url) <= 2048),
  add constraint scheduling_event_types_locations_check
    check (public.is_valid_scheduling_locations(locations)),
  add constraint scheduling_event_types_booking_fields_check
    check (public.is_valid_booking_fields(booking_fields));

update public.scheduling_event_types
set locations = case
  when location is null or trim(location) = '' or location = 'Google Meet'
    then '[{"type":"google_meet"}]'::jsonb
  when location ~* '^https?://'
    then jsonb_build_array(jsonb_build_object('type', 'link', 'value', location))
  else jsonb_build_array(jsonb_build_object('type', 'in_person', 'value', location))
end;

alter table public.bookings
  drop constraint bookings_event_id_fkey,
  alter column event_id drop not null,
  add constraint bookings_event_id_fkey
    foreign key (event_id) references public.events(id) on delete set null,
  add column uid uuid not null default gen_random_uuid(),
  add column guest_timezone text not null default 'UTC'
    check (char_length(guest_timezone) between 1 and 100),
  add column guest_locale text
    check (guest_locale is null or char_length(guest_locale) between 2 and 35),
  add column responses jsonb not null default '{}'::jsonb
    check (jsonb_typeof(responses) = 'object'),
  add column event_type_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(event_type_snapshot) = 'object'),
  add column management_token_hash text,
  add column provider_sync_status text not null default 'pending'
    check (provider_sync_status in ('pending', 'processing', 'synced', 'failed')),
  add column provider_sync_attempts integer not null default 0
    check (provider_sync_attempts >= 0),
  add column provider_sync_error text,
  add column provider_synced_at timestamptz,
  add column cancellation_reason text
    check (cancellation_reason is null or char_length(cancellation_reason) <= 1000),
  add column cancelled_at timestamptz,
  add column cancelled_by text
    check (cancelled_by is null or cancelled_by in ('guest', 'host', 'system')),
  add column rescheduled_from_id uuid references public.bookings(id) on delete set null,
  add column rescheduled_at timestamptz,
  add column ical_uid text,
  add column ical_sequence integer not null default 0
    check (ical_sequence >= 0);

alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check
  check (status in ('pending', 'confirmed', 'cancelled', 'rejected', 'rescheduled'));

update public.bookings booking
set event_type_snapshot = jsonb_build_object(
  'id', event_type.id,
  'slug', event_type.slug,
  'title', event_type.title,
  'durationMinutes', event_type.duration_minutes,
  'location', event_type.location,
  'locations', event_type.locations,
  'timezone', event_type.timezone,
  'disableCancelling', event_type.disable_cancelling,
  'disableRescheduling', event_type.disable_rescheduling,
  'minimumRescheduleNoticeMinutes', event_type.minimum_reschedule_notice_minutes
)
from public.scheduling_event_types event_type
where booking.event_type_id = event_type.id;

update public.bookings
set management_token_hash = encode(
  extensions.digest(extensions.gen_random_bytes(32), 'sha256'),
  'hex'
)
where management_token_hash is null;

alter table public.bookings
  alter column management_token_hash set not null,
  add constraint bookings_management_token_hash_check
    check (management_token_hash ~ '^[0-9a-f]{64}$');

create unique index bookings_uid_idx on public.bookings(uid);
create unique index bookings_management_token_hash_idx
  on public.bookings(management_token_hash);
create index bookings_user_start_idx
  on public.bookings(user_id, created_at desc);
create index bookings_status_start_idx
  on public.bookings(user_id, status, created_at desc);
create index bookings_rescheduled_from_idx
  on public.bookings(rescheduled_from_id)
  where rescheduled_from_id is not null;

create table public.booking_attendees (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  email text not null check (char_length(trim(email)) between 3 and 320),
  timezone text not null default 'UTC'
    check (char_length(timezone) between 1 and 100),
  locale text check (locale is null or char_length(locale) between 2 and 35),
  phone_number text check (
    phone_number is null or char_length(phone_number) between 3 and 40
  ),
  no_show boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, email)
);

create index booking_attendees_booking_id_idx
  on public.booking_attendees(booking_id);
create index booking_attendees_email_idx
  on public.booking_attendees(lower(email));

alter table public.booking_attendees enable row level security;

create policy "Users can view attendees for own bookings"
  on public.booking_attendees for select
  using (
    exists (
      select 1 from public.bookings booking
      where booking.id = booking_id and booking.user_id = auth.uid()
    )
  );

create trigger booking_attendees_updated_at
  before update on public.booking_attendees
  for each row execute function public.handle_updated_at();

insert into public.booking_attendees (
  booking_id, name, email, timezone
)
select id, guest_name, lower(guest_email), guest_timezone
from public.bookings
on conflict (booking_id, email) do nothing;

create table public.booking_references (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 50),
  reference_type text not null
    check (reference_type in ('calendar_event', 'video_meeting', 'email_message')),
  external_id text not null check (char_length(external_id) between 1 and 2048),
  external_calendar_id text,
  meeting_url text,
  status text not null default 'active'
    check (status in ('active', 'deleted', 'failed')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, provider, reference_type, external_id)
);

create index booking_references_booking_id_idx
  on public.booking_references(booking_id);

alter table public.booking_references enable row level security;

create policy "Users can view references for own bookings"
  on public.booking_references for select
  using (
    exists (
      select 1 from public.bookings booking
      where booking.id = booking_id and booking.user_id = auth.uid()
    )
  );

create trigger booking_references_updated_at
  before update on public.booking_references
  for each row execute function public.handle_updated_at();

create table public.booking_audit_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (
    action in (
      'created', 'confirmed', 'cancelled', 'rejected', 'rescheduled',
      'provider_sync_started', 'provider_sync_succeeded', 'provider_sync_failed'
    )
  ),
  actor_type text not null
    check (actor_type in ('guest', 'host', 'system', 'provider')),
  actor_label text,
  data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now()
);

create index booking_audit_log_booking_created_idx
  on public.booking_audit_log(booking_id, created_at desc);
create index booking_audit_log_user_created_idx
  on public.booking_audit_log(user_id, created_at desc);

alter table public.booking_audit_log enable row level security;

create policy "Users can view audit history for own bookings"
  on public.booking_audit_log for select
  using (auth.uid() = user_id);

insert into public.booking_audit_log (
  booking_id, user_id, action, actor_type, actor_label
)
select id, user_id, 'created', 'guest', guest_email
from public.bookings;

create table public.scheduling_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'booking.created', 'booking.cancelled', 'booking.rescheduled',
      'booking.confirmed', 'booking.rejected'
    )
  ),
  dedupe_key text not null unique
    check (char_length(dedupe_key) between 1 and 240),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scheduling_outbox_pending_idx
  on public.scheduling_outbox(status, available_at, created_at)
  where status in ('pending', 'failed');
create index scheduling_outbox_booking_idx
  on public.scheduling_outbox(booking_id, created_at desc);

alter table public.scheduling_outbox enable row level security;

create policy "Users can view side effects for own bookings"
  on public.scheduling_outbox for select
  using (auth.uid() = user_id);

create trigger scheduling_outbox_updated_at
  before update on public.scheduling_outbox
  for each row execute function public.handle_updated_at();

-- Existing bookings predate retryable provider synchronization. Queue each one
-- once so a future worker can reconcile it without a one-off migration script.
insert into public.scheduling_outbox (
  booking_id, user_id, event_type, dedupe_key, payload
)
select
  id,
  user_id,
  'booking.created',
  'booking.created:' || uid::text,
  jsonb_build_object('bookingUid', uid)
from public.bookings
on conflict (dedupe_key) do nothing;

-- Booking lifecycle changes must flow through audited service functions rather
-- than direct browser table updates.
drop policy "Users can update own bookings" on public.bookings;

-- Both validators back CHECK constraints on scheduling_event_types, and
-- Postgres evaluates those as the calling role, so the owner must be able to
-- execute them or every meeting type insert/update fails. They take jsonb and
-- return boolean without reading any data.
revoke all on function public.is_valid_scheduling_locations(jsonb)
  from public, anon;
grant execute on function public.is_valid_scheduling_locations(jsonb)
  to authenticated;
revoke all on function public.is_valid_booking_fields(jsonb)
  from public, anon;
grant execute on function public.is_valid_booking_fields(jsonb)
  to authenticated;