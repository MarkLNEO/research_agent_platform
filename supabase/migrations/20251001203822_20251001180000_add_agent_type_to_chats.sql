/*
  # Add Agent Type to Chats

  ## Overview
  Adds agent_type field to chats table to support multi-agent conversations.

  ## Changes
  1. Tables Modified
    - `chats`: Add `agent_type` column to track which agent is handling the conversation

  2. Agent Types
    - `company_profiler`: Handles onboarding and profile customization
    - `company_research`: Core research agent for deep company analysis
    - `find_prospects`: Helps users discover and qualify new prospects
    - `analyze_competitors`: Competitive intelligence and analysis
    - `market_trends`: Industry trends and market insights

  ## Notes
  - Existing chats default to 'company_research' for backward compatibility
  - Agent type determines the system prompt and capabilities available in the chat
*/

-- Add agent_type column to chats table
ALTER TABLE chats
ADD COLUMN IF NOT EXISTS agent_type TEXT
CHECK (agent_type IN ('company_profiler', 'company_research', 'find_prospects', 'analyze_competitors', 'market_trends'))
DEFAULT 'company_research';

-- Create index for agent type filtering
CREATE INDEX IF NOT EXISTS idx_chats_agent_type ON chats(agent_type);

-- Update existing chats to have agent_type
UPDATE chats
SET agent_type = 'company_research'
WHERE agent_type IS NULL;