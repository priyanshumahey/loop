alter table public.documents
  add column yjs_state text;

create table public.document_permissions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  granted_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, user_id)
);

create index document_permissions_user_document_idx
  on public.document_permissions(user_id, document_id);

alter table public.document_permissions enable row level security;

create or replace function public.is_document_owner(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.documents document
    where document.id = p_document_id
      and document.user_id = auth.uid()
  );
$$;

create or replace function public.document_role(p_document_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.documents document
      where document.id = p_document_id
        and document.user_id = auth.uid()
    ) then 'owner'
    else (
      select permission.role
      from public.document_permissions permission
      where permission.document_id = p_document_id
        and permission.user_id = auth.uid()
      limit 1
    )
  end;
$$;

revoke all on function public.is_document_owner(uuid) from public;
revoke all on function public.document_role(uuid) from public;
grant execute on function public.is_document_owner(uuid) to authenticated;
grant execute on function public.document_role(uuid) to authenticated;

create policy "Users can view relevant document permissions"
  on public.document_permissions for select
  using (
    auth.uid() = user_id
    or public.is_document_owner(document_id)
  );

create policy "Owners can insert document permissions"
  on public.document_permissions for insert
  with check (
    public.is_document_owner(document_id)
    and auth.uid() = granted_by
    and user_id <> auth.uid()
  );

create policy "Owners can update document permissions"
  on public.document_permissions for update
  using (public.is_document_owner(document_id))
  with check (
    public.is_document_owner(document_id)
    and user_id <> auth.uid()
  );

create policy "Owners can delete document permissions"
  on public.document_permissions for delete
  using (public.is_document_owner(document_id));

create policy "Collaborators can view shared documents"
  on public.documents for select
  using (public.document_role(id) in ('viewer', 'editor'));

create policy "Editors can update shared documents"
  on public.documents for update
  using (public.document_role(id) = 'editor')
  with check (public.document_role(id) = 'editor');

create or replace function public.prevent_document_owner_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'Document ownership cannot be changed';
  end if;
  return new;
end;
$$;

create trigger documents_prevent_owner_change
  before update on public.documents
  for each row execute function public.prevent_document_owner_change();

create trigger document_permissions_updated_at
  before update on public.document_permissions
  for each row execute function public.handle_updated_at();