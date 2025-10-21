/*
  # Persist user-defined indicator terminology

  Adds verbatim terminology fields captured during the welcome/profile coach flow
  so downstream research can reference the user's exact language.
*/

ALTER TABLE public.company_profiles
  ADD COLUMN IF NOT EXISTS preferred_terms JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.company_profiles
  ADD COLUMN IF NOT EXISTS indicator_choices TEXT[] DEFAULT ARRAY[]::text[];
