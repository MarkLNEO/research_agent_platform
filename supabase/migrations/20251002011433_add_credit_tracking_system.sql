/*
  # Add Credit Tracking System

  ## What This Does
  Implements a complete credit tracking system that deducts credits from users when they use the AI chat.

  ## New Functions
  - `deduct_user_credits(user_id, credits)` - Atomically deducts credits from a user's balance
  
  ## New Triggers
  - `on_auth_user_created` - Automatically creates a user record with default credits when someone signs up

  ## How It Works
  1. When a user signs up via Supabase Auth, a trigger automatically creates a record in the `users` table with 100 credits
  2. When the chat API is called, it checks if the user has credits
  3. After the response completes, credits are deducted based on token usage (1 credit per 1000 tokens)
  4. All usage is logged to `usage_logs` for transparency

  ## Important Notes
  - Credits are deducted AFTER the request completes (not before)
  - The function prevents negative credits (will set to 0 if attempting to deduct more than available)
  - All operations are atomic to prevent race conditions
*/

-- Create function to deduct credits atomically
CREATE OR REPLACE FUNCTION deduct_user_credits(
  p_user_id uuid,
  p_credits integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET 
    credits_remaining = GREATEST(0, credits_remaining - p_credits),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Create function to handle new user signups
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, credits_remaining, credits_total, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    100,  -- Default starting credits
    100,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION deduct_user_credits TO authenticated;
GRANT EXECUTE ON FUNCTION handle_new_user TO supabase_auth_admin;