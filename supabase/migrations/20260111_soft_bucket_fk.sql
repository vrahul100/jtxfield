-- Migration: Make bucket_id FK in txns soft (ON DELETE SET NULL)
-- This allows deleting buckets without deleting associated transactions

-- First, drop the existing constraint
ALTER TABLE txns DROP CONSTRAINT IF EXISTS txns_bucket_id_fkey;

-- Re-add with ON DELETE SET NULL
ALTER TABLE txns 
ADD CONSTRAINT txns_bucket_id_fkey 
FOREIGN KEY (bucket_id) 
REFERENCES buckets(id) 
ON DELETE SET NULL;

-- Add comment for documentation
COMMENT ON COLUMN txns.bucket_id IS 'The bucket this transaction was created from. Can be NULL if bucket was deleted.';
