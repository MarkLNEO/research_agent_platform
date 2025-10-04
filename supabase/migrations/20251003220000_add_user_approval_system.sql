-- Add User Approval System
-- Migration: 20251003220000_add_user_approval_system.sql
-- Date: October 3, 2025
-- Purpose: Require admin approval for new signups (mlerner@rebarhq.ai)

-- Add approval fields to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS approval_status TEXT 
    CHECK (approval_status IN ('pending', 'approved', 'rejected')) 
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

-- Update existing users to approved status (grandfather them in)
UPDATE users 
SET approval_status = 'approved', 
    approved_at = now()
WHERE approval_status IS NULL;

-- Drop and recreate the new user trigger with approval logic
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Check if this is mlerner@rebarhq.ai (auto-approve admin)
  IF NEW.email = 'mlerner@rebarhq.ai' THEN
    INSERT INTO public.users (
      id, email, name, credits_remaining, credits_total, 
      approval_status, approved_at, created_at, updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
      10000,  -- Admin gets 10k credits
      10000,
      'approved',
      now(),
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  ELSE
    -- Regular users start pending with 0 credits
    INSERT INTO public.users (
      id, email, name, credits_remaining, credits_total, 
      approval_status, created_at, updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
      0,  -- No credits until approved
      0,
      'pending',  -- Requires approval
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to approve a user (only callable by admin)
CREATE OR REPLACE FUNCTION approve_user(
  user_id_to_approve UUID,
  admin_email TEXT,
  notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only mlerner@rebarhq.ai can approve
  IF admin_email != 'mlerner@rebarhq.ai' THEN
    RAISE EXCEPTION 'Unauthorized: Only mlerner@rebarhq.ai can approve users';
  END IF;

  -- Update user to approved and grant credits
  UPDATE users
  SET 
    approval_status = 'approved',
    approved_by = (
      SELECT id FROM users WHERE email = admin_email
    ),
    approved_at = now(),
    approval_notes = notes,
    credits_remaining = 1000,
    credits_total = 1000,
    updated_at = now()
  WHERE id = user_id_to_approve;

  RETURN FOUND;
END;
$$;

-- Function to reject a user
CREATE OR REPLACE FUNCTION reject_user(
  user_id_to_reject UUID,
  admin_email TEXT,
  notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only mlerner@rebarhq.ai can reject
  IF admin_email != 'mlerner@rebarhq.ai' THEN
    RAISE EXCEPTION 'Unauthorized: Only mlerner@rebarhq.ai can reject users';
  END IF;

  -- Update user to rejected
  UPDATE users
  SET 
    approval_status = 'rejected',
    approved_by = (
      SELECT id FROM users WHERE email = admin_email
    ),
    approved_at = now(),
    approval_notes = notes,
    updated_at = now()
  WHERE id = user_id_to_reject;

  RETURN FOUND;
END;
$$;

-- Create index for faster approval queries
CREATE INDEX IF NOT EXISTS idx_users_approval_status ON users(approval_status);

-- Add comment
COMMENT ON COLUMN users.approval_status IS 'User approval status: pending (awaiting approval), approved (can use system), rejected (denied access)';
