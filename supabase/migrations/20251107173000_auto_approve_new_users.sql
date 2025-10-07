-- Auto-approve new signups and ensure they start with research credits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    name,
    credits_remaining,
    credits_total,
    approval_status,
    approved_at,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    1000,
    1000,
    'approved',
    now(),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      credits_remaining = CASE
        WHEN public.users.approval_status = 'rejected' THEN public.users.credits_remaining
        ELSE GREATEST(COALESCE(public.users.credits_remaining, 0), 1000)
      END,
      credits_total = CASE
        WHEN public.users.approval_status = 'rejected' THEN public.users.credits_total
        ELSE GREATEST(COALESCE(public.users.credits_total, 0), 1000)
      END,
      approval_status = CASE
        WHEN public.users.approval_status = 'rejected' THEN public.users.approval_status
        ELSE 'approved'
      END,
      approved_at = CASE
        WHEN public.users.approval_status = 'rejected' THEN public.users.approved_at
        ELSE COALESCE(public.users.approved_at, now())
      END,
      updated_at = now();

  RETURN NEW;
END;
$$;

-- Backfill existing pending users so they receive credits
UPDATE public.users
SET
  approval_status = 'approved',
  approved_at = COALESCE(approved_at, now()),
  credits_remaining = GREATEST(COALESCE(credits_remaining, 0), 1000),
  credits_total = GREATEST(COALESCE(credits_total, 0), 1000),
  updated_at = now()
WHERE approval_status IS DISTINCT FROM 'rejected';
