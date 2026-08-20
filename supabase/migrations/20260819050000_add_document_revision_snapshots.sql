create or replace function public.snapshot_document_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.content is not distinct from new.content
    and old.title is not distinct from new.title then
    return new;
  end if;

  if not exists (
    select 1
    from public.document_revisions revision
    where revision.document_id = old.id
      and revision.created_at > now() - interval '5 minutes'
  ) then
    insert into public.document_revisions (
      document_id,
      user_id,
      title,
      content,
      source
    ) values (
      old.id,
      old.user_id,
      old.title,
      old.content,
      'user'
    );
  end if;

  return new;
end;
$$;

create trigger documents_snapshot_revision
  before update of title, content on public.documents
  for each row execute function public.snapshot_document_revision();