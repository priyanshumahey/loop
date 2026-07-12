create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  access_token text not null,
  refresh_token text not null,
  expiry_date bigint not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider)
);

create index oauth_tokens_user_id_idx on public.oauth_tokens(user_id);
create index oauth_tokens_provider_idx on public.oauth_tokens(user_id, provider);

alter table public.oauth_tokens enable row level security;

create policy "Users can view own oauth tokens"
  on public.oauth_tokens for select
  using (auth.uid() = user_id);

create policy "Users can insert own oauth tokens"
  on public.oauth_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users can update own oauth tokens"
  on public.oauth_tokens for update
  using (auth.uid() = user_id);

create policy "Users can delete own oauth tokens"
  on public.oauth_tokens for delete
  using (auth.uid() = user_id);

create trigger oauth_tokens_updated_at
  before update on public.oauth_tokens
  for each row execute function public.handle_updated_at();
