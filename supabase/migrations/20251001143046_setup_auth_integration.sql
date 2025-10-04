/*
  # Setup Auth Integration

  ## Overview
  Creates a trigger to automatically create a user record in the users table
  when a new auth user is created via Supabase Auth.

  ## Changes
  1. Creates a function to handle new auth user creation
  2. Sets up a trigger on auth.users insert
  3. Ensures user records are created with default credits

  ## Security
  - Function runs with security definer privileges
  - Only creates records for new auth users
  - Sets sensible defaults for new users
*/

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, account_type, credits_remaining, credits_total)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'individual',
    100,
    100
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();