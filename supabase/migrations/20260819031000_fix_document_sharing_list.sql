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