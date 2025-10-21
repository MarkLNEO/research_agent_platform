/*
  # Entity Aliases

  Stores canonical entity names with associated aliases so the research agent
  can normalize terminology (e.g., "m365" → "Microsoft 365").
*/

CREATE TABLE IF NOT EXISTS public.entity_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical TEXT NOT NULL,
  aliases TEXT[] NOT NULL,
  type TEXT NOT NULL,
  metadata JSONB,
  source TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT entity_aliases_canonical_unique UNIQUE (canonical)
);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_type ON public.entity_aliases (type);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_aliases ON public.entity_aliases USING GIN (aliases);

ALTER TABLE public.entity_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entity aliases readable"
  ON public.entity_aliases FOR SELECT
  TO authenticated
  USING (true);

-- Updates performed via service role; no direct insert/update policies for end users.

DROP TRIGGER IF EXISTS trg_entity_aliases_updated ON public.entity_aliases;
CREATE TRIGGER trg_entity_aliases_updated
  BEFORE UPDATE ON public.entity_aliases
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
