alter table public.documents
  add column public_token text not null default encode(gen_random_bytes(16), 'hex'),
  add column public_access text not null default 'none'
    check (public_access in ('none', 'view')),
  add unique (public_token),
  add check (public_token ~ '^[a-f0-9]{32}$');

create table public.document_access_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  requested_role text not null default 'viewer'
    check (requested_role in ('viewer', 'editor')),
  message text check (message is null or char_length(message) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index document_access_requests_pending_idx
  on public.document_access_requests(document_id, requester_id)
  where status = 'pending';

create index document_access_requests_document_status_idx
  on public.document_access_requests(document_id, status, created_at);

alter table public.document_access_requests enable row level security;

create trigger document_access_requests_updated_at
  before update on public.document_access_requests
  for each row execute function public.handle_updated_at();

create or replace function public.get_public_document(p_token text)
returns table (
  document_id uuid,
  title text,
  content jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select document.id, document.title, document.content, document.updated_at
  from public.documents document
  where document.public_token = p_token
    and document.public_access = 'view';
$$;

create or replace function public.set_document_public_access(
  p_document_id uuid,
  p_access text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  share_token text;
begin
  if not public.is_document_owner(p_document_id) then
    raise exception 'Only the document owner can manage sharing';
  end if;
  if p_access not in ('none', 'view') then
    raise exception 'Invalid public access level';
  end if;

  update public.documents
  set public_access = p_access
  where id = p_document_id
  returning public_token into share_token;

  return share_token;
end;
$$;

create or replace function public.request_document_access(
  p_document_id uuid,
  p_requested_role text,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_requested_role not in ('viewer', 'editor') then
    raise exception 'Invalid requested role';
  end if;
  if p_message is not null and char_length(trim(p_message)) > 500 then
    raise exception 'Message is too long';
  end if;
  if public.document_role(p_document_id) is not null then
    raise exception 'You already have access to this document';
  end if;
  if not exists (select 1 from public.documents where id = p_document_id) then
    raise exception 'Document not found';
  end if;

  insert into public.document_access_requests (
    document_id,
    requester_id,
    requested_role,
    message
  ) values (
    p_document_id,
    auth.uid(),
    p_requested_role,
    nullif(trim(p_message), '')
  )
  returning id into request_id;

  return request_id;
exception
  when unique_violation then
    raise exception 'You already have a pending access request';
end;
$$;

create or replace function public.list_document_access_requests(
  p_document_id uuid
)
returns table (
  request_id uuid,
  requester_id uuid,
  requester_email text,
  requested_role text,
  message text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_document_owner(p_document_id) then
    raise exception 'Only the document owner can manage sharing';
  end if;

  return query
  select
    request.id,
    request.requester_id,
    account.email::text,
    request.requested_role,
    request.message,
    request.created_at
  from public.document_access_requests request
  join auth.users account on account.id = request.requester_id
  where request.document_id = p_document_id
    and request.status = 'pending'
  order by request.created_at asc;
end;
$$;

create or replace function public.respond_document_access_request(
  p_request_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  access_request public.document_access_requests%rowtype;
begin
  select * into access_request
  from public.document_access_requests
  where id = p_request_id
    and status = 'pending';

  if access_request.id is null
    or not public.is_document_owner(access_request.document_id) then
    raise exception 'Access request not found';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid request response';
  end if;

  if p_status = 'approved' then
    insert into public.document_permissions (
      document_id,
      user_id,
      role,
      granted_by
    ) values (
      access_request.document_id,
      access_request.requester_id,
      access_request.requested_role,
      auth.uid()
    )
    on conflict (document_id, user_id)
    do update set role = excluded.role;
  end if;

  update public.document_access_requests
  set
    status = p_status,
    responded_by = auth.uid(),
    responded_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.get_public_document(text) from public;
revoke all on function public.set_document_public_access(uuid, text) from public;
revoke all on function public.request_document_access(uuid, text, text) from public;
revoke all on function public.list_document_access_requests(uuid) from public;
revoke all on function public.respond_document_access_request(uuid, text) from public;

grant execute on function public.get_public_document(text) to anon, authenticated;
grant execute on function public.set_document_public_access(uuid, text) to authenticated;
grant execute on function public.request_document_access(uuid, text, text) to authenticated;
grant execute on function public.list_document_access_requests(uuid) to authenticated;
grant execute on function public.respond_document_access_request(uuid, text) to authenticated;