/*
  # Bulk Research Tasks Table

  - Tracks per-company tasks for a bulk research job
  - Enables concurrency-limited processing
  - Supports retries and progress updates
*/

CREATE TABLE IF NOT EXISTS bulk_research_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES bulk_research_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed')) DEFAULT 'pending',
  result TEXT,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bulk_tasks_job ON bulk_research_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_bulk_tasks_status ON bulk_research_tasks(status);

-- RLS: users can only access their own tasks (service role bypasses)
ALTER TABLE bulk_research_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bulk tasks" ON bulk_research_tasks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own bulk tasks" ON bulk_research_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own bulk tasks" ON bulk_research_tasks
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
