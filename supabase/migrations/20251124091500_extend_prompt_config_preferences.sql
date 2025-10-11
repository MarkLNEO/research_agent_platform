-- Align user_prompt_config with frontend preferences (summary + depth).
alter table public.user_prompt_config
  add column if not exists preferred_research_type text check (preferred_research_type in ('quick', 'deep', 'specific')),
  add column if not exists default_output_brevity text check (default_output_brevity in ('short', 'standard', 'long')) default 'standard',
  add column if not exists always_tldr boolean default true,
  add column if not exists summary_preference_set boolean default false;

-- Ensure existing rows comply with new defaults.
update public.user_prompt_config
set
  default_output_brevity = coalesce(default_output_brevity, 'standard'),
  always_tldr = coalesce(always_tldr, true),
  summary_preference_set = coalesce(summary_preference_set, false);
