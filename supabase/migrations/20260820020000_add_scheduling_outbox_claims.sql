create or replace function public.claim_scheduling_outbox(
  p_limit integer default 10,
  p_lease_timeout interval default interval '5 minutes'
)
returns setof public.scheduling_outbox
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_limit not between 1 and 100 then
    raise exception 'Outbox claim limit must be between 1 and 100';
  end if;
  if p_lease_timeout < interval '30 seconds'
    or p_lease_timeout > interval '1 hour' then
    raise exception 'Outbox lease timeout must be between 30 seconds and 1 hour';
  end if;

  return query
  with candidates as (
    select outbox.id
    from public.scheduling_outbox outbox
    where (
        outbox.status in ('pending', 'failed')
        and outbox.available_at <= now()
      ) or (
        outbox.status = 'processing'
        and outbox.locked_at < now() - p_lease_timeout
      )
    order by outbox.available_at, outbox.created_at
    for update skip locked
    limit p_limit
  )
  update public.scheduling_outbox outbox
  set
    status = 'processing',
    attempts = outbox.attempts + 1,
    locked_at = now(),
    last_error = null,
    updated_at = now()
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

revoke all on function public.claim_scheduling_outbox(integer, interval)
  from public, anon, authenticated;
grant execute on function public.claim_scheduling_outbox(integer, interval)
  to service_role;