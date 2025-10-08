-- Add source_task_id for idempotent bulk auto-saves
ALTER TABLE research_outputs
  ADD COLUMN IF NOT EXISTS source_task_id UUID;

-- Enforce uniqueness when provided (multiple NULLs allowed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_research_outputs_source_task_id'
  ) THEN
    CREATE UNIQUE INDEX uq_research_outputs_source_task_id
      ON public.research_outputs (source_task_id)
      WHERE source_task_id IS NOT NULL;
  END IF;
END $$;
