/*
  # Add Conversation Summary Support

  1. New Columns
    - Add `summary` to `chats` table to store condensed conversation history
    - Add `summary_updated_at` to track when summary was last regenerated
    - Add `message_count_at_summary` to know when to regenerate

  2. Purpose
    - Enable context window optimization for long conversations
    - Preserve conversation continuity while reducing token usage
    - Store condensed history when conversations exceed threshold
*/

-- Add summary columns to chats table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chats' AND column_name = 'summary'
  ) THEN
    ALTER TABLE chats ADD COLUMN summary text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chats' AND column_name = 'summary_updated_at'
  ) THEN
    ALTER TABLE chats ADD COLUMN summary_updated_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chats' AND column_name = 'message_count_at_summary'
  ) THEN
    ALTER TABLE chats ADD COLUMN message_count_at_summary int DEFAULT 0;
  END IF;
END $$;