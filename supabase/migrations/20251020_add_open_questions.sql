/*
  # Open Questions

  Persists unresolved follow-up questions so the agent can re-surface them
  in future sessions until answered or resolved.
*/

CREATE TABLE IF NOT EXISTS public.open_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  context JSONB,
  asked_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_open_questions_user ON public.open_questions (user_id);
CREATE INDEX IF NOT EXISTS idx_open_questions_active
  ON public.open_questions (user_id, asked_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.open_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their open questions"
  ON public.open_questions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their open questions"
  ON public.open_questions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_open_questions_updated ON public.open_questions;
CREATE TRIGGER trg_open_questions_updated
  BEFORE UPDATE ON public.open_questions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
