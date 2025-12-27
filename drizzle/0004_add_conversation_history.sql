-- Add conversation_history column to buckets table
ALTER TABLE buckets ADD COLUMN IF NOT EXISTS conversation_history JSONB DEFAULT '[]';

-- Add 'cancelled' to bucket status (if using enum, update it)
-- For now, status is likely a varchar/text, so we just need to handle it in code
