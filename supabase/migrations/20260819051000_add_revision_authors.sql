alter table public.document_revisions
  add column created_by uuid references auth.users(id) on delete set null;

update public.document_revisions
set created_by = user_id
where created_by is null;

alter table public.document_revisions
  alter column created_by set default auth.uid();

create or replace function public.create_document_checkpoint(
  p_document_id uuid,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  checkpoint_id uuid;
  effective_role text;
begin
  effective_role := public.document_role(p_document_id);
  if effective_role not in ('owner', 'editor') then
    raise exception 'Document edit access required';
  end if;
  if p_source not in ('agent', 'restore', 'template') then
    raise exception 'Invalid revision source';
  end if;

  insert into public.document_revisions (
    document_id,
    user_id,
    title,
    content,
    source,
    created_by
  )
  select
    document.id,
    document.user_id,
    document.title,
    document.content,
    p_source,
    auth.uid()
  from public.documents document
  where document.id = p_document_id
  returning id into checkpoint_id;

  if checkpoint_id is null then
    raise exception 'Document not found';
  end if;
  return checkpoint_id;
end;
$$;

revoke all on function public.create_document_checkpoint(uuid, text) from public;
grant execute on function public.create_document_checkpoint(uuid, text) to authenticated;