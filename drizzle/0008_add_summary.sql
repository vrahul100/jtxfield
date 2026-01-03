-- Add summary field to buckets table
ALTER TABLE buckets ADD COLUMN IF NOT EXISTS summary TEXT;

-- Add index for better query performance if needed
COMMENT ON COLUMN buckets.summary IS 'LLM-generated concise summary of the work described';
