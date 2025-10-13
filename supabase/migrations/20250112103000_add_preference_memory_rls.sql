-- Enable RLS and policies for persistent preference memory tables

alter table if exists public.knowledge_entries enable row level security;
alter table if exists public.implicit_preferences enable row level security;
alter table if exists public.preference_events enable row level security;
alter table if exists public.knowledge_suggestions enable row level security;

drop policy if exists knowledge_entries_select_self on public.knowledge_entries;
create policy knowledge_entries_select_self
  on public.knowledge_entries
  for select
  using (auth.uid() = user_id);

drop policy if exists knowledge_entries_modify_self on public.knowledge_entries;
create policy knowledge_entries_modify_self
  on public.knowledge_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists implicit_preferences_select_self on public.implicit_preferences;
create policy implicit_preferences_select_self
  on public.implicit_preferences
  for select
  using (auth.uid() = user_id);

drop policy if exists implicit_preferences_modify_self on public.implicit_preferences;
create policy implicit_preferences_modify_self
  on public.implicit_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists preference_events_select_self on public.preference_events;
create policy preference_events_select_self
  on public.preference_events
  for select
  using (auth.uid() = user_id);

drop policy if exists preference_events_insert_self on public.preference_events;
create policy preference_events_insert_self
  on public.preference_events
  for insert
  with check (auth.uid() = user_id);

drop policy if exists knowledge_suggestions_select_self on public.knowledge_suggestions;
create policy knowledge_suggestions_select_self
  on public.knowledge_suggestions
  for select
  using (auth.uid() = user_id);

drop policy if exists knowledge_suggestions_modify_self on public.knowledge_suggestions;
create policy knowledge_suggestions_modify_self
  on public.knowledge_suggestions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
