alter table public.events
  add column recurrence jsonb,
  add column recurring_event_id text,
  add column original_start_time text;

create index events_recurring_series_idx
  on public.events(user_id, google_calendar_id, recurring_event_id)
  where recurring_event_id is not null;

comment on column public.events.recurrence is
  'Loop recurrence settings for a recurring event parent.';
comment on column public.events.recurring_event_id is
  'Google event ID of the parent series for an expanded occurrence.';
comment on column public.events.original_start_time is
  'Google originalStartTime value that stably identifies a recurring occurrence.';