-- DEBUG: Check if triggers and pg_net are properly set up
-- Run in Supabase SQL Editor

-- 1. Check if pg_net extension exists
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- 2. List all triggers on buckets table
SELECT 
    tgname AS trigger_name,
    tgenabled AS enabled,
    pg_get_triggerdef(oid) AS definition
FROM pg_trigger 
WHERE tgrelid = 'buckets'::regclass;

-- 3. Check if notify_bucket_processing function exists
SELECT 
    proname AS function_name,
    pg_get_functiondef(oid) AS definition
FROM pg_proc 
WHERE proname = 'notify_bucket_processing';

-- 4. Check recent buckets and their statuses
SELECT id, status, created_at, updated_at 
FROM buckets 
ORDER BY created_at DESC 
LIMIT 5;

-- 5. Check pg_net request history (if available)
SELECT * FROM net._http_response ORDER BY created DESC LIMIT 10;
