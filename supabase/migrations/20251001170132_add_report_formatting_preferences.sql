/*
  # Add Report Formatting and Prompt Configuration

  ## Overview
  Adds support for user-customizable report formatting and flexible prompt configuration.
  Users can define their preferred report structure, sections, and detail levels, which
  are then saved and reused for future research.

  ## New Tables

  ### user_report_preferences
  - Stores customizable report formatting preferences per user
  - Includes section definitions, order, detail levels
  - Supports custom sections that users request to add
  - Versioned to track changes over time

  ### user_prompt_config
  - Stores which variables/context to include in system prompts
  - Allows flexibility to enable/disable certain prompt components
  - Future-proofs the prompt architecture for customization

  ## Enhanced Tables

  ### company_profiles (new columns)
  - report_sections: JSONB array of report sections with configuration
  - report_detail_level: Overall verbosity preference (concise/standard/detailed)
  - prompt_variables_enabled: Which context variables to include in prompts

  ## Security
  - RLS enabled on all new tables
  - Users can only access their own data
*/

-- User report formatting preferences
CREATE TABLE IF NOT EXISTS user_report_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  report_type TEXT CHECK (report_type IN ('company_research', 'prospect_list', 'competitive_analysis', 'market_intelligence')) NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]',
  section_order JSONB DEFAULT '[]',
  detail_level TEXT CHECK (detail_level IN ('concise', 'standard', 'detailed')) DEFAULT 'standard',
  custom_instructions TEXT,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_prefs_user ON user_report_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_report_prefs_type ON user_report_preferences(report_type);
CREATE INDEX IF NOT EXISTS idx_report_prefs_active ON user_report_preferences(is_active) WHERE is_active = TRUE;

ALTER TABLE user_report_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own report preferences"
  ON user_report_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own report preferences"
  ON user_report_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own report preferences"
  ON user_report_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own report preferences"
  ON user_report_preferences FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- User prompt configuration
CREATE TABLE IF NOT EXISTS user_prompt_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  include_company_context BOOLEAN DEFAULT TRUE,
  include_custom_criteria BOOLEAN DEFAULT TRUE,
  include_signal_preferences BOOLEAN DEFAULT TRUE,
  include_icp_definition BOOLEAN DEFAULT TRUE,
  include_competitors BOOLEAN DEFAULT TRUE,
  include_decision_maker_targets BOOLEAN DEFAULT TRUE,
  include_disqualifying_criteria BOOLEAN DEFAULT TRUE,
  custom_prompt_additions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE user_prompt_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own prompt config"
  ON user_prompt_config FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prompt config"
  ON user_prompt_config FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prompt config"
  ON user_prompt_config FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add default report sections column to company_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_profiles' AND column_name = 'default_report_sections'
  ) THEN
    ALTER TABLE company_profiles 
    ADD COLUMN default_report_sections JSONB DEFAULT '[
      {"name": "executive_summary", "enabled": true, "order": 1},
      {"name": "scoring_analysis", "enabled": true, "order": 2},
      {"name": "custom_criteria", "enabled": true, "order": 3},
      {"name": "buying_signals", "enabled": true, "order": 4},
      {"name": "decision_makers", "enabled": true, "order": 5},
      {"name": "company_background", "enabled": true, "order": 6},
      {"name": "competitive_intelligence", "enabled": true, "order": 7},
      {"name": "strategic_recommendations", "enabled": true, "order": 8},
      {"name": "sources", "enabled": true, "order": 9}
    ]',
    ADD COLUMN report_detail_level TEXT CHECK (report_detail_level IN ('concise', 'standard', 'detailed')) DEFAULT 'standard';
  END IF;
END $$;

-- Insert default prompt config for existing users
INSERT INTO user_prompt_config (user_id)
SELECT id FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM user_prompt_config WHERE user_id = users.id
);

-- Insert default report preferences for existing users
INSERT INTO user_report_preferences (user_id, report_type, sections)
SELECT 
  u.id,
  rt.type,
  '[
    {"name": "executive_summary", "enabled": true, "order": 1, "detail_level": "standard"},
    {"name": "scoring_analysis", "enabled": true, "order": 2, "detail_level": "standard"},
    {"name": "custom_criteria", "enabled": true, "order": 3, "detail_level": "detailed"},
    {"name": "buying_signals", "enabled": true, "order": 4, "detail_level": "detailed"},
    {"name": "decision_makers", "enabled": true, "order": 5, "detail_level": "detailed"},
    {"name": "company_background", "enabled": true, "order": 6, "detail_level": "standard"},
    {"name": "competitive_intelligence", "enabled": true, "order": 7, "detail_level": "standard"},
    {"name": "strategic_recommendations", "enabled": true, "order": 8, "detail_level": "standard"},
    {"name": "sources", "enabled": true, "order": 9, "detail_level": "concise"}
  ]'::jsonb
FROM users u
CROSS JOIN (VALUES 
  ('company_research'),
  ('prospect_list'),
  ('competitive_analysis'),
  ('market_intelligence')
) AS rt(type)
WHERE NOT EXISTS (
  SELECT 1 FROM user_report_preferences 
  WHERE user_id = u.id AND report_type = rt.type
);