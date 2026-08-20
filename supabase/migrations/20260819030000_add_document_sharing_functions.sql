create or replace function public.list_document_permissions(p_document_id uuid)
returns table (
  permission_id uuid,
  user_id uuid,
  email text,
  role text,
  is_owner boolean,
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
    null::uuid,
    owner_user.id,
    owner_user.email::text,
    'owner'::text,
    true,
    document.created_at
  from public.documents document
  join auth.users owner_user on owner_user.id = document.user_id
  where document.id = p_document_id

  union all

  select
    permission.id,
    permission.user_id,
    collaborator.email::text,
    permission.role,
    false,
    permission.created_at
  from public.document_permissions permission
  join auth.users collaborator on collaborator.id = permission.user_id
  where permission.document_id = p_document_id
  order by 5 desc, 6 asc;
end;
$$;

create or replace function public.grant_document_permission_by_email(
  p_document_id uuid,
  p_email text,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
  permission_id uuid;
begin
  if not public.is_document_owner(p_document_id) then
    raise exception 'Only the document owner can manage sharing';
  end if;
  if p_role not in ('viewer', 'editor') then
    raise exception 'Invalid document role';
  end if;

  select account.id into target_user_id
  from auth.users account
  where lower(account.email) = lower(trim(p_email))
  limit 1;

  if target_user_id is null then
    raise exception 'No Loop account found for that email';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'The owner already has access';
  end if;

  insert into public.document_permissions (
    document_id,
    user_id,
    role,
    granted_by
  ) values (
    p_document_id,
    target_user_id,
    p_role,
    auth.uid()
  )
  on conflict (document_id, user_id)
  do update set role = excluded.role
  returning id into permission_id;

  return permission_id;
end;
$$;

create or replace function public.update_document_permission_role(
  p_permission_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_document_id uuid;
begin
  if p_role not in ('viewer', 'editor') then
    raise exception 'Invalid document role';
  end if;

  select permission.document_id into target_document_id
  from public.document_permissions permission
  where permission.id = p_permission_id;

  if target_document_id is null
    or not public.is_document_owner(target_document_id) then
    raise exception 'Only the document owner can manage sharing';
  end if;

  update public.document_permissions
  set role = p_role
  where id = p_permission_id;
end;
$$;

create or replace function public.revoke_document_permission(
  p_permission_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_document_id uuid;
begin
  select permission.document_id into target_document_id
  from public.document_permissions permission
  where permission.id = p_permission_id;

  if target_document_id is null
    or not public.is_document_owner(target_document_id) then
    raise exception 'Only the document owner can manage sharing';
  end if;

  delete from public.document_permissions
  where id = p_permission_id;
end;
$$;

revoke all on function public.list_document_permissions(uuid) from public;
revoke all on function public.grant_document_permission_by_email(uuid, text, text) from public;
revoke all on function public.update_document_permission_role(uuid, text) from public;
revoke all on function public.revoke_document_permission(uuid) from public;

grant execute on function public.list_document_permissions(uuid) to authenticated;
grant execute on function public.grant_document_permission_by_email(uuid, text, text) to authenticated;
grant execute on function public.update_document_permission_role(uuid, text) to authenticated;
grant execute on function public.revoke_document_permission(uuid) to authenticated;