-- Add research_count tracking to user_prompt_config so we can persist milestone prompts
ALTER TABLE public.user_prompt_config
  ADD COLUMN IF NOT EXISTS research_count INTEGER NOT NULL DEFAULT 0;

-- Ensure existing rows have a concrete value (especially when column was added with default but existing rows may be null)
UPDATE public.user_prompt_config
  SET research_count = COALESCE(research_count, 0);
