alter table public.documents
  drop constraint documents_folder_id_user_id_fkey;

alter table public.documents
  add foreign key (folder_id, user_id)
  references public.document_folders(id, user_id)
  on delete set null (folder_id);
