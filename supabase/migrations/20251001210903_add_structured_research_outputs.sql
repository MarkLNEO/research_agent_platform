/*
  # Enhanced Research Outputs Schema

  ## Overview
  Adds structured fields to research_outputs table to support:
  - ICP fit scoring (0-100)
  - Signal scoring (0-100) 
  - Composite scoring
  - Priority levels (hot/warm/standard)
  - Structured company data
  - Leadership information
  - Custom criteria assessments
  - Personalization points
  - Recommended actions

  ## Changes
  1. Add scoring columns to research_outputs
  2. Add structured JSONB fields for detailed data
  3. Add indexes for efficient querying
  4. Add computed column for composite score

  ## Security
  - RLS policies already in place from initial schema
  - No changes needed to existing policies
*/

-- Add new columns to research_outputs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_outputs' AND column_name = 'icp_fit_score'
  ) THEN
    ALTER TABLE research_outputs 
    ADD COLUMN icp_fit_score INTEGER CHECK (icp_fit_score >= 0 AND icp_fit_score <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_outputs' AND column_name = 'signal_score'
  ) THEN
    ALTER TABLE research_outputs 
    ADD COLUMN signal_score INTEGER CHECK (signal_score >= 0 AND signal_score <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_outputs' AND column_name = 'composite_score'
  ) THEN
    ALTER TABLE research_outputs 
    ADD COLUMN composite_score INTEGER CHECK (composite_score >= 0 AND composite_score <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_outputs' AND column_name = 'priority_level'
  ) THEN
    ALTER TABLE research_outputs 
    ADD COLUMN priority_level TEXT CHECK (priority_level IN ('hot', 'warm', 'standard'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_outputs' AND column_name = 'company_data'
  ) THEN
    ALTER TABLE research_outputs 
    ADD COLUMN company_data JSONB DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_outputs' AND column_name = 'leadership_team'
  ) THEN
    ALTER TABLE research_outputs 
    ADD COLUMN leadership_team JSONB DEFAULT '[]';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_outputs' AND column_name = 'buying_signals'
  ) THEN
    ALTER TABLE research_outputs 
    ADD COLUMN buying_signals JSONB DEFAULT '[]';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_outputs' AND column_name = 'custom_criteria_assessment'
  ) THEN
    ALTER TABLE research_outputs 
    ADD COLUMN custom_criteria_assessment JSONB DEFAULT '[]';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_outputs' AND column_name = 'personalization_points'
  ) THEN
    ALTER TABLE research_outputs 
    ADD COLUMN personalization_points JSONB DEFAULT '[]';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_outputs' AND column_name = 'recommended_actions'
  ) THEN
    ALTER TABLE research_outputs 
    ADD COLUMN recommended_actions JSONB DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_outputs' AND column_name = 'executive_summary'
  ) THEN
    ALTER TABLE research_outputs 
    ADD COLUMN executive_summary TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_outputs' AND column_name = 'markdown_report'
  ) THEN
    ALTER TABLE research_outputs 
    ADD COLUMN markdown_report TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_outputs' AND column_name = 'confidence_level'
  ) THEN
    ALTER TABLE research_outputs 
    ADD COLUMN confidence_level TEXT CHECK (confidence_level IN ('high', 'medium', 'low'));
  END IF;
END $$;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_research_outputs_priority ON research_outputs(priority_level);
CREATE INDEX IF NOT EXISTS idx_research_outputs_icp_score ON research_outputs(icp_fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_research_outputs_signal_score ON research_outputs(signal_score DESC);
CREATE INDEX IF NOT EXISTS idx_research_outputs_composite_score ON research_outputs(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_research_outputs_type_user ON research_outputs(research_type, user_id);

-- Add comment for documentation
COMMENT ON COLUMN research_outputs.icp_fit_score IS 'ICP fit score from 0-100 based on how well company matches ideal customer profile';
COMMENT ON COLUMN research_outputs.signal_score IS 'Buying signal score from 0-100 based on recent events and urgency indicators';
COMMENT ON COLUMN research_outputs.composite_score IS 'Weighted composite: (Signal × 0.4) + (ICP Fit × 0.3) + (Custom Criteria × 0.3)';
COMMENT ON COLUMN research_outputs.priority_level IS 'Priority level: hot (>=80), warm (>=60), standard (<60)';
COMMENT ON COLUMN research_outputs.company_data IS 'Structured company information: industry, size, location, founded, etc.';
COMMENT ON COLUMN research_outputs.leadership_team IS 'Array of leadership team members with roles and LinkedIn profiles';
COMMENT ON COLUMN research_outputs.buying_signals IS 'Array of detected buying signals with dates, scores, and impact';
COMMENT ON COLUMN research_outputs.custom_criteria_assessment IS 'Assessment of user-defined custom criteria with values and confidence';
COMMENT ON COLUMN research_outputs.personalization_points IS 'Array of personalization opportunities for outreach';
COMMENT ON COLUMN research_outputs.recommended_actions IS 'Recommended actions: timing, messaging, targets';
COMMENT ON COLUMN research_outputs.executive_summary IS 'Brief 2-3 sentence summary of research findings';
COMMENT ON COLUMN research_outputs.markdown_report IS 'Full markdown-formatted research report';
COMMENT ON COLUMN research_outputs.confidence_level IS 'Overall confidence in research findings';
