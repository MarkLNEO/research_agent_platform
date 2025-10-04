-- Create bulk research jobs table
CREATE TABLE IF NOT EXISTS bulk_research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  companies TEXT[] NOT NULL,
  research_type TEXT NOT NULL CHECK (research_type IN ('quick', 'deep')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total_count INTEGER NOT NULL,
  completed_count INTEGER DEFAULT 0,
  results JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE bulk_research_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own bulk research jobs" ON bulk_research_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bulk research jobs" ON bulk_research_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update bulk research jobs" ON bulk_research_jobs
  FOR UPDATE USING (true);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_bulk_research_jobs_user_id ON bulk_research_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_research_jobs_status ON bulk_research_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bulk_research_jobs_created_at ON bulk_research_jobs(created_at DESC);
