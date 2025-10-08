/*
  # Template-Driven Research Engine

  Introduces registry tables for declarative templates, guardrail profiles,
  signal detector sets, and reusable playbooks. Also adds golden run fixtures
  and ICP profile storage so experiences can be reused across industries.
*/

-- Use case templates (declarative specs)
CREATE TABLE IF NOT EXISTS use_case_templates (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  json_spec JSONB NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE use_case_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System templates readable by all"
  ON use_case_templates FOR SELECT
  TO authenticated
  USING (is_system = TRUE);

CREATE POLICY "Users manage their templates"
  ON use_case_templates FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Guardrail profiles
CREATE TABLE IF NOT EXISTS guardrail_profiles (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  policy JSONB NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE guardrail_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guardrails readable"
  ON guardrail_profiles FOR SELECT
  TO authenticated
  USING (is_system = TRUE OR created_by = auth.uid());

CREATE POLICY "Guardrails writable"
  ON guardrail_profiles FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Signal detector sets
CREATE TABLE IF NOT EXISTS signal_sets_catalog (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  detectors JSONB NOT NULL,
  scoring JSONB NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE signal_sets_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signal sets readable"
  ON signal_sets_catalog FOR SELECT
  TO authenticated
  USING (is_system = TRUE OR created_by = auth.uid());

CREATE POLICY "Signal sets writable"
  ON signal_sets_catalog FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- ICP Profiles for reuse across playbooks
CREATE TABLE IF NOT EXISTS icp_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  definition JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE icp_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ICP readable"
  ON icp_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "ICP writable"
  ON icp_profiles FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Playbooks tie templates, guardrails, signal sets, and defaults
CREATE TABLE IF NOT EXISTS research_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT,
  template_id TEXT REFERENCES use_case_templates(id) ON DELETE CASCADE,
  guardrail_profile_id TEXT REFERENCES guardrail_profiles(id),
  signal_set_id TEXT REFERENCES signal_sets_catalog(id),
  inputs JSONB DEFAULT '{}',
  exports TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE research_playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Playbooks readable"
  ON research_playbooks FOR SELECT
  TO authenticated
  USING (is_system = TRUE OR auth.uid() = user_id);

CREATE POLICY "Playbooks writable"
  ON research_playbooks FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Golden run fixtures for evaluation
CREATE TABLE IF NOT EXISTS golden_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id TEXT REFERENCES use_case_templates(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  fixture JSONB NOT NULL,
  assertions TEXT[] NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE golden_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Golden runs readable"
  ON golden_runs FOR SELECT
  TO authenticated
  USING (created_by IS NULL OR created_by = auth.uid());

CREATE POLICY "Golden runs writable"
  ON golden_runs FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Helper trigger to keep timestamps fresh
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_use_case_templates_updated ON use_case_templates;
CREATE TRIGGER trg_use_case_templates_updated
  BEFORE UPDATE ON use_case_templates
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
