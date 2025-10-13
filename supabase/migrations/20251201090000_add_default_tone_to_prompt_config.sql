alter table public.user_prompt_config
  add column if not exists default_tone text check (default_tone in ('warm', 'balanced', 'direct')) default 'balanced';

update public.user_prompt_config
set default_tone = coalesce(default_tone, 'balanced')
where default_tone is null or default_tone not in ('warm', 'balanced', 'direct');
