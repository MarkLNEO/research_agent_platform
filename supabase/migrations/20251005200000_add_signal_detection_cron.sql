-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage on cron schema to postgres
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create a cron job that runs every 6 hours to detect signals
-- This will call our edge function to check all tracked accounts for signals
SELECT cron.schedule(
  'detect-account-signals', -- job name
  '0 */6 * * *', -- every 6 hours (at minute 0)
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/cron-signal-detection',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'trigger', 'scheduled',
      'timestamp', now()
    )
  );
  $$
);

-- Also create a more frequent job for hot accounts (every hour)
-- This can be used for high-priority accounts with critical signals enabled
SELECT cron.schedule(
  'detect-hot-signals', -- job name
  '30 * * * *', -- every hour at minute 30
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/cron-signal-detection',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'trigger', 'scheduled_hot',
      'priority': 'high',
      'timestamp', now()
    )
  );
  $$
);

-- Create a function to manually trigger signal detection (for testing)
CREATE OR REPLACE FUNCTION trigger_signal_detection()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/detect-signals',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'trigger', 'manual',
      'timestamp', now()
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION trigger_signal_detection() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION trigger_signal_detection() IS 'Manually trigger signal detection for all tracked accounts. Use for testing or on-demand detection.';