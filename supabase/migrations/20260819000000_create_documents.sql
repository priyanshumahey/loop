create table public.document_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (parent_id, user_id)
    references public.document_folders(id, user_id) on delete cascade
);

create unique index document_folders_user_parent_name_idx
  on public.document_folders(
    user_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

create index document_folders_user_parent_idx
  on public.document_folders(user_id, parent_id, updated_at desc);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id uuid,
  title text not null default 'Untitled' check (char_length(title) between 1 and 240),
  content jsonb not null default '[{"type":"p","children":[{"text":""}]}]'::jsonb,
  kind text not null default 'document' check (kind in ('document', 'template')),
  creation_mode text not null default 'classic' check (creation_mode in ('classic', 'agent')),
  starred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (folder_id, user_id)
    references public.document_folders(id, user_id) on delete set null (folder_id)
);

create index documents_user_folder_updated_idx
  on public.documents(user_id, folder_id, kind, updated_at desc);

create index documents_user_starred_idx
  on public.documents(user_id, starred, updated_at desc)
  where starred = true;

create table public.document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  content jsonb not null,
  source text not null default 'user' check (source in ('user', 'agent', 'restore', 'template')),
  created_at timestamptz not null default now(),
  foreign key (document_id, user_id)
    references public.documents(id, user_id) on delete cascade
);

create index document_revisions_document_created_idx
  on public.document_revisions(user_id, document_id, created_at desc);

alter table public.agent_conversations
  add column scope text not null default 'calendar'
    check (scope in ('calendar', 'documents', 'document')),
  add column document_id uuid,
  add foreign key (document_id, user_id)
    references public.documents(id, user_id) on delete cascade;

create index agent_conversations_scope_updated_idx
  on public.agent_conversations(user_id, scope, document_id, updated_at desc);

alter table public.document_folders enable row level security;
alter table public.documents enable row level security;
alter table public.document_revisions enable row level security;

create policy "Users can view own document folders"
  on public.document_folders for select
  using (auth.uid() = user_id);

create policy "Users can insert own document folders"
  on public.document_folders for insert
  with check (auth.uid() = user_id);

create policy "Users can update own document folders"
  on public.document_folders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own document folders"
  on public.document_folders for delete
  using (auth.uid() = user_id);

create policy "Users can view own documents"
  on public.documents for select
  using (auth.uid() = user_id);

create policy "Users can insert own documents"
  on public.documents for insert
  with check (auth.uid() = user_id);

create policy "Users can update own documents"
  on public.documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own documents"
  on public.documents for delete
  using (auth.uid() = user_id);

create policy "Users can view own document revisions"
  on public.document_revisions for select
  using (auth.uid() = user_id);

create policy "Users can insert own document revisions"
  on public.document_revisions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own document revisions"
  on public.document_revisions for delete
  using (auth.uid() = user_id);

create trigger document_folders_updated_at
  before update on public.document_folders
  for each row execute function public.handle_updated_at();

create trigger documents_updated_at
  before update on public.documents
  for each row execute function public.handle_updated_at();