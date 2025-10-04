-- Add Email Notifications for User Approvals
-- Migration: 20251003221500_add_email_notifications.sql
-- Date: October 3, 2025
-- Purpose: Send email to mlerner@rebarhq.ai when new users sign up

-- Create function to send approval notification via webhook
CREATE OR REPLACE FUNCTION notify_new_user_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  webhook_url TEXT;
BEGIN
  -- Only send notification for non-admin users who are pending
  IF NEW.email != 'mlerner@rebarhq.ai' AND NEW.approval_status = 'pending' THEN
    -- Get the webhook URL from environment (set in Supabase dashboard)
    webhook_url := current_setting('app.settings.approval_webhook_url', true);
    
    -- If webhook URL is configured, send notification
    IF webhook_url IS NOT NULL AND webhook_url != '' THEN
      PERFORM
        net.http_post(
          url := webhook_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json'
          ),
          body := jsonb_build_object(
            'user', jsonb_build_object(
              'id', NEW.id,
              'email', NEW.email,
              'name', NEW.name,
              'created_at', NEW.created_at
            )
          )
        );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to send notification after user insert
DROP TRIGGER IF EXISTS on_user_created_send_notification ON users;
CREATE TRIGGER on_user_created_send_notification
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_user_signup();

-- Add comment
COMMENT ON FUNCTION notify_new_user_signup() IS 'Sends email notification to admin when a new user signs up and needs approval';
