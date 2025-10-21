create table if not exists public.user_entity_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  alias text not null,
  alias_normalized text generated always as (lower(trim(alias))) stored,
  canonical text not null,
  type text not null default 'unknown',
  metadata jsonb,
  source text default 'user',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, alias_normalized)
);

create index if not exists idx_user_entity_aliases_user on public.user_entity_aliases (user_id);
