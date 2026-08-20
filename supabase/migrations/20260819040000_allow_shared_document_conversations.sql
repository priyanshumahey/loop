alter table public.agent_conversations
  drop constraint agent_conversations_document_id_user_id_fkey;

alter table public.agent_conversations
  add foreign key (document_id)
  references public.documents(id)
  on delete cascade;