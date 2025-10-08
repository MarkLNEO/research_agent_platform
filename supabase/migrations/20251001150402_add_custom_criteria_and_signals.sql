/*
  # Add Custom Criteria and Signals Framework

  ## Overview
  This migration adds support for universal customization through user-defined qualifying 
  criteria and buying signals detection, making the platform adaptable to any industry.

  ## New Tables
  
  ### user_custom_criteria
  - Stores user-defined qualifying criteria (e.g., "Single-family focused", "Units managed")
  - Each user can define multiple criteria with types, importance levels, and hints
  - Enables universal customization across industries
  
  ### user_signal_preferences
  - Stores which buying signals users want to track (e.g., security breaches, funding rounds)
  - Includes importance weighting and lookback periods
  - Powers time-sensitive outreach recommendations
  
  ### user_disqualifying_criteria
  - Stores automatic disqualification rules (e.g., "Too small", "Wrong industry")
  - Used to filter out non-fits early in research process
  
  ### company_signals
  - Caches detected signals for companies (e.g., recent breach, leadership change)
  - Includes expiration for freshness
  - Indexed for fast lookups by company and date
  
  ### research_results
  - Comprehensive storage of research outputs
  - Includes basic data, custom criteria results, signals data, and scoring
  - Tracks ICP fit, signal strength, and composite scores
  
  ## Enhanced Tables
  
  ### company_profiles (new columns)
  - user_role, use_case: Role and primary use case for personalization
  - industry, icp_definition: Industry and ICP for context
  - target_titles, seniority_levels, target_departments: Decision maker targeting
  - output_format, output_style: Output preferences
  
  ## Security
  - All tables have RLS enabled
  - Users can only access their own data
  - Proper foreign key constraints with cascading deletes
*/

-- Custom criteria storage
CREATE TABLE IF NOT EXISTS user_custom_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  field_name TEXT NOT NULL,
  field_type TEXT CHECK (field_type IN ('text', 'number', 'boolean', 'list')) NOT NULL,
  importance TEXT CHECK (importance IN ('critical', 'important', 'optional')) NOT NULL,
  hints JSONB DEFAULT '[]',
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_custom_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own custom criteria"
  ON user_custom_criteria FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own custom criteria"
  ON user_custom_criteria FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own custom criteria"
  ON user_custom_criteria FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own custom criteria"
  ON user_custom_criteria FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Signals preferences
CREATE TABLE IF NOT EXISTS user_signal_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  signal_type TEXT NOT NULL,
  importance TEXT CHECK (importance IN ('critical', 'important', 'nice_to_have')) NOT NULL,
  lookback_days INTEGER DEFAULT 90,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_signal_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own signal preferences"
  ON user_signal_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own signal preferences"
  ON user_signal_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own signal preferences"
  ON user_signal_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own signal preferences"
  ON user_signal_preferences FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Disqualifying criteria
CREATE TABLE IF NOT EXISTS user_disqualifying_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  criterion TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_disqualifying_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own disqualifying criteria"
  ON user_disqualifying_criteria FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own disqualifying criteria"
  ON user_disqualifying_criteria FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own disqualifying criteria"
  ON user_disqualifying_criteria FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own disqualifying criteria"
  ON user_disqualifying_criteria FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Detected signals cache
CREATE TABLE IF NOT EXISTS company_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  company_url TEXT,
  signal_type TEXT NOT NULL,
  signal_date DATE NOT NULL,
  description TEXT,
  source_url TEXT,
  severity TEXT,
  metadata JSONB DEFAULT '{}',
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_company_signals_name ON company_signals(company_name);
CREATE INDEX IF NOT EXISTS idx_company_signals_date ON company_signals(signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_company_signals_expires ON company_signals(expires_at);

-- No RLS on company_signals - it's shared cached data

-- Enhanced research results
CREATE TABLE IF NOT EXISTS research_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  company_name TEXT NOT NULL,
  company_url TEXT,
  basic_data JSONB NOT NULL DEFAULT '{}',
  custom_criteria_data JSONB NOT NULL DEFAULT '{}',
  signals_data JSONB DEFAULT '{}',
  decision_makers JSONB DEFAULT '[]',
  personalization_points JSONB DEFAULT '[]',
  icp_fit_score INTEGER,
  signal_score INTEGER DEFAULT 0,
  composite_score INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'STANDARD',
  disqualified BOOLEAN DEFAULT FALSE,
  disqualified_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_results_user ON research_results(user_id);
CREATE INDEX IF NOT EXISTS idx_research_results_composite_score ON research_results(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_research_results_priority ON research_results(priority);

ALTER TABLE research_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own research results"
  ON research_results FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own research results"
  ON research_results FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own research results"
  ON research_results FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own research results"
  ON research_results FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add columns to company_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_profiles' AND column_name = 'user_role'
  ) THEN
    ALTER TABLE company_profiles 
    ADD COLUMN user_role TEXT,
    ADD COLUMN use_case TEXT,
    ADD COLUMN industry TEXT,
    ADD COLUMN icp_definition TEXT,
    ADD COLUMN target_titles JSONB DEFAULT '[]',
    ADD COLUMN seniority_levels JSONB DEFAULT '[]',
    ADD COLUMN target_departments JSONB DEFAULT '[]',
    ADD COLUMN output_format TEXT DEFAULT 'pdf',
    ADD COLUMN output_style TEXT DEFAULT 'executive_summary';
  END IF;
END $$;