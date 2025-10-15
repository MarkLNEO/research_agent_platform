-- Vector brain schema (embeddings + relations)
-- Safe to run multiple times

create extension if not exists vector;
create extension if not exists pgcrypto;

-- Embeddings table
create table if not exists public.embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_type text not null,
  object_key text not null,
  chunk_id int not null default 0,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

-- Uniqueness across a user's object chunk
create unique index if not exists idx_embeddings_object_unique
  on public.embeddings(user_id, object_type, object_key, chunk_id);

-- Approximate index for cosine similarity
do $$ begin
  perform 1 from pg_indexes where schemaname='public' and indexname='idx_embeddings_cosine';
  if not found then
    execute 'create index idx_embeddings_cosine on public.embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100)';
  end if;
end $$;

alter table public.embeddings enable row level security;

do $$ begin
  create policy "embeddings_select_own" on public.embeddings for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "embeddings_insert_own" on public.embeddings for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "embeddings_update_own" on public.embeddings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "embeddings_delete_own" on public.embeddings for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- Relationship edges (lightweight knowledge graph)
create table if not exists public.relations (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  src_type text not null,
  src_key text not null,
  dst_type text not null,
  dst_key text not null,
  relation_type text not null,
  weight real not null default 1.0,
  created_at timestamptz not null default now(),
  unique(user_id, src_type, src_key, dst_type, dst_key, relation_type)
);

create index if not exists idx_relations_src on public.relations(user_id, src_type, src_key);
create index if not exists idx_relations_dst on public.relations(user_id, dst_type, dst_key);

alter table public.relations enable row level security;
do $$ begin
  create policy "relations_select_own" on public.relations for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "relations_mutate_own" on public.relations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- RPC for nearest-neighbor search
create or replace function public.match_embeddings(
  p_user uuid,
  p_query vector(1536),
  p_object_type text default null,
  p_top_k int default 10
)
returns table (
  id uuid,
  object_type text,
  object_key text,
  chunk_id int,
  content text,
  metadata jsonb,
  score float
)
language sql
security definer
set search_path = public
as $$
  select e.id, e.object_type, e.object_key, e.chunk_id, e.content, e.metadata,
         1 - (e.embedding <=> p_query) as score
  from public.embeddings e
  where e.user_id = p_user
    and (p_object_type is null or e.object_type = p_object_type)
  order by e.embedding <=> p_query asc
  limit greatest(1, p_top_k);
$$;

grant execute on function public.match_embeddings(uuid, vector(1536), text, int) to authenticated;

