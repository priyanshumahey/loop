-- Durable storage for the calendar agent's conversations. The full UIMessage[]
-- history (including tool-call parts and their outputs) is stored as JSONB so
-- it round-trips exactly. localStorage acts as a client-side cache; this table
-- is the source of truth and enables cross-device sync.
create table public.agent_conversations (
  -- Client-generated UUID (matches the id used in localStorage), so upserts
  -- from the browser are idempotent.
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- List pattern: a user's conversations, most-recently-updated first.
create index agent_conversations_user_updated_idx
  on public.agent_conversations(user_id, updated_at desc);

alter table public.agent_conversations enable row level security;

create policy "Users can view own conversations"
  on public.agent_conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversations"
  on public.agent_conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversations"
  on public.agent_conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own conversations"
  on public.agent_conversations for delete
  using (auth.uid() = user_id);

-- Reuses public.handle_updated_at() defined in the oauth_tokens migration.
create trigger agent_conversations_updated_at
  before update on public.agent_conversations
  for each row execute function public.handle_updated_at();
