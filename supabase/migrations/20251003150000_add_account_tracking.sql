/*
  # Account Tracking Infrastructure
  
  ## Overview
  Adds tables for AE workflow: tracking strategic accounts and monitoring signals
  
  ## New Tables
  
  ### tracked_accounts
  - Strategic accounts that users want to monitor
  - Links to user who's tracking the account
  - Stores latest research reference and monitoring state
  - Calculates priority based on signals
  
  ### account_signals  
  - Links detected signals to specific tracked accounts
  - References company_signals table for signal data
  - Tracks user viewing/dismissing signals
  - Enables signal-based account prioritization
  
  ## Security
  - RLS enabled on all tables
  - Users can only access their own tracked accounts and signals
*/

-- Tracked accounts table
CREATE TABLE IF NOT EXISTS tracked_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  company_name TEXT NOT NULL,
  company_url TEXT,
  industry TEXT,
  employee_count INTEGER,
  
  -- Tracking metadata
  added_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_researched_at TIMESTAMPTZ,
  monitoring_enabled BOOLEAN DEFAULT TRUE,
  
  -- Latest research link
  latest_research_id UUID REFERENCES research_outputs(id) ON DELETE SET NULL,
  
  -- Calculated scores (updated by triggers/functions)
  icp_fit_score INTEGER CHECK (icp_fit_score >= 0 AND icp_fit_score <= 100),
  signal_score INTEGER DEFAULT 0 CHECK (signal_score >= 0 AND signal_score <= 100),
  priority TEXT CHECK (priority IN ('hot', 'warm', 'standard')) DEFAULT 'standard',
  
  -- User notes and actions
  last_contacted_at TIMESTAMPTZ,
  notes TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure user can't track same company twice
  UNIQUE(user_id, company_name)
);

-- Account signals - links detected signals to tracked accounts
CREATE TABLE IF NOT EXISTS account_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES tracked_accounts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  
  -- Signal details (could also reference company_signals, but duplicating for flexibility)
  signal_type TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')) NOT NULL,
  description TEXT NOT NULL,
  signal_date DATE NOT NULL,
  source_url TEXT,
  
  -- Scoring
  importance TEXT CHECK (importance IN ('critical', 'important', 'nice_to_have')) DEFAULT 'important',
  score INTEGER DEFAULT 0,
  
  -- User interaction
  viewed BOOLEAN DEFAULT FALSE,
  viewed_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tracked_accounts_user ON tracked_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_accounts_priority ON tracked_accounts(priority, user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_accounts_monitoring ON tracked_accounts(monitoring_enabled, user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_accounts_last_researched ON tracked_accounts(last_researched_at);

CREATE INDEX IF NOT EXISTS idx_account_signals_account ON account_signals(account_id);
CREATE INDEX IF NOT EXISTS idx_account_signals_user ON account_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_account_signals_viewed ON account_signals(viewed, user_id);
CREATE INDEX IF NOT EXISTS idx_account_signals_date ON account_signals(signal_date DESC);

-- Row Level Security
ALTER TABLE tracked_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tracked accounts"
  ON tracked_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tracked accounts"
  ON tracked_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tracked accounts"
  ON tracked_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tracked accounts"
  ON tracked_accounts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Account signals RLS
ALTER TABLE account_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own account signals"
  ON account_signals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own account signals"
  ON account_signals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own account signals"
  ON account_signals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own account signals"
  ON account_signals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to update account priority based on signals
CREATE OR REPLACE FUNCTION update_account_priority()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate signal score for the account
  UPDATE tracked_accounts
  SET 
    signal_score = COALESCE(
      (SELECT 
        LEAST(100, SUM(score))
      FROM account_signals
      WHERE account_id = NEW.account_id
        AND dismissed = FALSE
        AND signal_date >= CURRENT_DATE - INTERVAL '90 days'
      ), 0
    ),
    priority = CASE
      WHEN COALESCE(
        (SELECT SUM(score) FROM account_signals 
         WHERE account_id = NEW.account_id 
           AND dismissed = FALSE
           AND signal_date >= CURRENT_DATE - INTERVAL '90 days'
        ), 0
      ) >= 80 THEN 'hot'
      WHEN COALESCE(
        (SELECT SUM(score) FROM account_signals 
         WHERE account_id = NEW.account_id 
           AND dismissed = FALSE
           AND signal_date >= CURRENT_DATE - INTERVAL '90 days'
        ), 0
      ) >= 60 THEN 'warm'
      ELSE 'standard'
    END,
    updated_at = NOW()
  WHERE id = NEW.account_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update priority when signals change
CREATE TRIGGER trigger_update_account_priority
  AFTER INSERT OR UPDATE OR DELETE ON account_signals
  FOR EACH ROW
  EXECUTE FUNCTION update_account_priority();

-- Function to mark account as researched
CREATE OR REPLACE FUNCTION mark_account_researched()
RETURNS TRIGGER AS $$
BEGIN
  -- If a new research_output is created for a tracked account, update it
  UPDATE tracked_accounts
  SET 
    last_researched_at = NOW(),
    latest_research_id = NEW.id,
    icp_fit_score = NEW.icp_fit_score,
    updated_at = NOW()
  WHERE user_id = NEW.user_id
    AND company_name = NEW.subject
    AND monitoring_enabled = TRUE;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on research_outputs to auto-update tracked accounts
CREATE TRIGGER trigger_mark_account_researched
  AFTER INSERT ON research_outputs
  FOR EACH ROW
  WHEN (NEW.research_type = 'company')
  EXECUTE FUNCTION mark_account_researched();

-- Comments for documentation
COMMENT ON TABLE tracked_accounts IS 'Strategic accounts that users monitor continuously for signals and updates';
COMMENT ON TABLE account_signals IS 'Detected buying signals linked to specific tracked accounts';
COMMENT ON COLUMN tracked_accounts.priority IS 'Calculated from signal_score: hot (>=80), warm (>=60), standard (<60)';
COMMENT ON COLUMN tracked_accounts.signal_score IS 'Composite score from recent unviewed signals (0-100)';
COMMENT ON COLUMN account_signals.score IS 'Individual signal contribution to account priority';
