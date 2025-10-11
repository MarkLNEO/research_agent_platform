alter table public.user_prompt_config
  add column if not exists default_followup_questions jsonb default '[]'::jsonb;

update public.user_prompt_config
set default_followup_questions = coalesce(default_followup_questions, '[]'::jsonb);
