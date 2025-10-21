/*
  # Harden preference, alias, and follow-up tables with policies & indexes
*/

-- Ensure canonical lookup is efficient
CREATE INDEX IF NOT EXISTS idx_entity_aliases_canonical
  ON public.entity_aliases (canonical);

-- Shared read, service-role write for aliases
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'entity_aliases'
      AND policyname = 'write aliases svc'
  ) THEN
    CREATE POLICY "write aliases svc" ON public.entity_aliases
      FOR ALL
      USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role')
      WITH CHECK ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role');
  END IF;
END $$;

-- Service role full access to preferences & open questions (client already covered)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_preferences'
      AND policyname = 'svc all prefs'
  ) THEN
    CREATE POLICY "svc all prefs" ON public.user_preferences
      AS PERMISSIVE
      FOR ALL
      TO public
      USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role')
      WITH CHECK ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'open_questions'
      AND policyname = 'svc all questions'
  ) THEN
    CREATE POLICY "svc all questions" ON public.open_questions
      AS PERMISSIVE
      FOR ALL
      TO public
      USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role')
      WITH CHECK ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role');
  END IF;
END $$;
