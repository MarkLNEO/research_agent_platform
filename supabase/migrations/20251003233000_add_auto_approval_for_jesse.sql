-- Add auto-approval for jesse@nevereverordinary.com with same privileges as admin auto-approval
-- Also update the handle_new_user trigger to include this email

-- Update trigger function to auto-approve Jesse as well
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Auto-approve special emails
  IF NEW.email IN ('mlerner@rebarhq.ai', 'jesse@nevereverordinary.com') THEN
    INSERT INTO public.users (
      id, email, name, credits_remaining, credits_total,
      approval_status, approved_at, created_at, updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
      10000,
      10000,
      'approved',
      now(),
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  ELSE
    -- Regular users start pending with 0 credits until approved
    INSERT INTO public.users (
      id, email, name, credits_remaining, credits_total,
      approval_status, created_at, updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
      0,
      0,
      'pending',
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- If Jesse already exists in users table, ensure approved and grant 10k if not already set
UPDATE public.users
SET 
  approval_status = 'approved',
  approved_at = COALESCE(approved_at, now()),
  credits_total = CASE WHEN COALESCE(credits_total, 0) = 0 THEN 10000 ELSE credits_total END,
  credits_remaining = CASE WHEN COALESCE(credits_total, 0) = 0 THEN 10000 ELSE credits_remaining END,
  updated_at = now()
WHERE email = 'jesse@nevereverordinary.com';

