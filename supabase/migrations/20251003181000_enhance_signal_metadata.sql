/*
  # Enhance signal metadata and activity logging

  ## Changes
  - Adds detection_source and raw_payload columns to account_signals for traceability
  - Creates signal_activity_log table to capture detector executions and outcomes
*/

ALTER TABLE account_signals
  ADD COLUMN IF NOT EXISTS detection_source TEXT DEFAULT 'gpt_web_search',
  ADD COLUMN IF NOT EXISTS raw_payload JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS signal_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  account_id UUID REFERENCES tracked_accounts(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  detector TEXT NOT NULL,
  status TEXT CHECK (status IN ('success', 'noop', 'error')) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  detected_signals INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_activity_log_user ON signal_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_signal_activity_log_account ON signal_activity_log(account_id);
CREATE INDEX IF NOT EXISTS idx_signal_activity_log_created ON signal_activity_log(created_at DESC);
