-- Supabase Edge Function Trigger Setup
-- Run in Supabase SQL Editor for each environment (DEV/PROD)
-- 
-- DEV:  https://supabase.com/dashboard/project/jbojgxyqexgcooduavhx/sql
-- PROD: https://supabase.com/dashboard/project/gevdamoroboqxpacbdkk/sql
--
-- IMPORTANT: Update the URL and Authorization token for each environment!

-- Enable pg_net extension
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create the trigger function with logging
-- NOTE: Update URL and Bearer token for each environment:
--   DEV:  https://jbojgxyqexgcooduavhx.supabase.co/functions/v1/process-bucket
--   PROD: https://gevdamoroboqxpacbdkk.supabase.co/functions/v1/process-bucket
CREATE OR REPLACE FUNCTION notify_bucket_processing()
RETURNS TRIGGER AS $$
BEGIN
    RAISE LOG '[TRIGGER] notify_bucket_processing fired for bucket #% (status: %)', NEW.id, NEW.status;
    
    -- DEV anon key (update for PROD)
    PERFORM "net"."http_post"(
        url:='https://jbojgxyqexgcooduavhx.supabase.co/functions/v1/process-bucket'::text,
        body:=jsonb_build_object('bucketId', NEW.id),
        headers:=jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR_DEV_ANON_KEY_HERE'
        )
    );
    
    RAISE LOG '[TRIGGER] HTTP POST sent for bucket #%', NEW.id;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE LOG '[TRIGGER] ERROR for bucket #%: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing triggers
DROP TRIGGER IF EXISTS trigger_notify_bucket ON buckets;
DROP TRIGGER IF EXISTS trigger_notify_bucket_insert ON buckets;
DROP TRIGGER IF EXISTS trigger_notify_bucket_update ON buckets;

-- Trigger for INSERT (new buckets with pending_processing status)
CREATE TRIGGER trigger_notify_bucket_insert
    AFTER INSERT ON buckets
    FOR EACH ROW
    WHEN (NEW.status = 'pending_processing')
    EXECUTE FUNCTION notify_bucket_processing();

-- Trigger for UPDATE (only when status CHANGES TO pending_processing)
-- This prevents infinite loops when Edge Function updates the bucket
CREATE TRIGGER trigger_notify_bucket_update
    AFTER UPDATE OF status ON buckets
    FOR EACH ROW
    WHEN (
        NEW.status = 'pending_processing' 
        AND OLD.status != 'pending_processing'
    )
    EXECUTE FUNCTION notify_bucket_processing();

-- Verify setup
SELECT 'Triggers created:' as status;
SELECT tgname FROM pg_trigger WHERE tgrelid = 'buckets'::regclass;
