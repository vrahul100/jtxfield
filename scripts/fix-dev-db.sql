-- Run this in Supabase SQL Editor to add missing columns and verify trigger
 
-- 1. Add missing columns
ALTER TABLE buckets ADD COLUMN IF NOT EXISTS potential_change text;
ALTER TABLE buckets ADD COLUMN IF NOT EXISTS extracted_data text;

-- 2. Verify columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'buckets' 
ORDER BY ordinal_position;

-- 3. Check if trigger exists
SELECT 
    tgname AS trigger_name,
    tgenabled AS enabled,
    pg_get_triggerdef(oid) AS definition
FROM pg_trigger 
WHERE tgrelid = 'buckets'::regclass;

-- 4. Check if pg_net extension exists
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- 5. Check pg_net HTTP response logs (to see if trigger is firing but failing)
SELECT * FROM net._http_response ORDER BY created DESC LIMIT 20;
