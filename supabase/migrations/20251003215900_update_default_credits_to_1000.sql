-- Update default credits for new users from 100 to 1000
-- Migration: 20251003215900_update_default_credits_to_1000.sql
-- Date: October 3, 2025

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate the function with 1000 credits instead of 100
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, credits_remaining, credits_total, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    1000,  -- Updated: Default starting credits (was 100)
    1000,  -- Updated: Total credits (was 100)
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Optional: Update existing users who only have 100 credits to 1000
-- (Uncomment if you want to give existing users the new credit amount)
-- UPDATE public.users 
-- SET credits_remaining = 1000, credits_total = 1000, updated_at = now()
-- WHERE credits_total = 100 AND credits_remaining <= 100;
