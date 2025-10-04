-- Expand allowed agent types in chats to include 'settings_agent'
-- Drop old unnamed check constraint and add a named one

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.chats'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%agent_type%IN%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.chats DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.chats
  ADD CONSTRAINT chk_chats_agent_type
  CHECK (agent_type IN (
    'company_profiler',
    'company_research',
    'find_prospects',
    'analyze_competitors',
    'market_trends',
    'settings_agent'
  ));

