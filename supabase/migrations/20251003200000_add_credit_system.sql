-- Add credit system to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_remaining INTEGER DEFAULT 1000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_total_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_credit_request_at TIMESTAMP;

-- Add approval system
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

-- Credit usage log
CREATE TABLE IF NOT EXISTS credit_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
  tokens_used INTEGER NOT NULL,
  credits_used INTEGER NOT NULL,
  query_type TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_usage_user ON credit_usage_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_usage_chat ON credit_usage_log(chat_id);

-- Update existing users to approved status (for testing)
UPDATE users SET approval_status = 'approved' WHERE approval_status IS NULL OR approval_status = 'pending';

-- RLS policies for credit_usage_log
ALTER TABLE credit_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credit usage"
  ON credit_usage_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert credit usage"
  ON credit_usage_log FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Function to check if user has credits
CREATE OR REPLACE FUNCTION check_user_credits(user_id_param UUID)
RETURNS TABLE (
  has_credits BOOLEAN,
  credits_remaining INTEGER,
  approval_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (u.credits_remaining > 0) as has_credits,
    u.credits_remaining,
    u.approval_status
  FROM users u
  WHERE u.id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to deduct credits
CREATE OR REPLACE FUNCTION deduct_credits(
  user_id_param UUID,
  credits_to_deduct INTEGER,
  tokens_used_param INTEGER,
  chat_id_param UUID DEFAULT NULL,
  query_type_param TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  new_balance INTEGER,
  message TEXT
) AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  -- Get current credits
  SELECT credits_remaining INTO current_credits
  FROM users
  WHERE id = user_id_param;

  -- Check if enough credits
  IF current_credits < credits_to_deduct THEN
    RETURN QUERY SELECT FALSE, current_credits, 'Insufficient credits';
    RETURN;
  END IF;

  -- Deduct credits
  UPDATE users
  SET 
    credits_remaining = credits_remaining - credits_to_deduct,
    credits_total_used = COALESCE(credits_total_used, 0) + credits_to_deduct
  WHERE id = user_id_param;

  -- Log usage
  INSERT INTO credit_usage_log (user_id, chat_id, tokens_used, credits_used, query_type)
  VALUES (user_id_param, chat_id_param, tokens_used_param, credits_to_deduct, query_type_param);

  -- Return success
  SELECT credits_remaining INTO current_credits
  FROM users
  WHERE id = user_id_param;

  RETURN QUERY SELECT TRUE, current_credits, 'Credits deducted successfully';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE credit_usage_log IS 'Tracks credit consumption per user per query';
COMMENT ON FUNCTION check_user_credits IS 'Check if user has available credits and approval status';
COMMENT ON FUNCTION deduct_credits IS 'Deduct credits from user account and log usage';
