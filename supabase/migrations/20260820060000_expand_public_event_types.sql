drop function public.get_public_event_type(text);

create or replace function public.get_public_event_type(p_slug text)
returns table(
  slug text,
  title text,
  description text,
  duration_minutes integer,
  location text,
  locations jsonb,
  booking_window_days integer,
  requires_confirmation boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    event_type.slug,
    event_type.title,
    event_type.description,
    event_type.duration_minutes,
    event_type.location,
    event_type.locations,
    event_type.booking_window_days,
    event_type.requires_confirmation
  from public.scheduling_event_types event_type
  where event_type.slug = p_slug and event_type.active = true
  limit 1;
$$;

revoke all on function public.get_public_event_type(text)
  from public, anon, authenticated;
grant execute on function public.get_public_event_type(text)
  to anon, authenticated;