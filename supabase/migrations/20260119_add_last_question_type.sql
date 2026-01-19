-- Add last_question_type column to buckets table
-- This tracks what question was last asked so responses can be interpreted in context

ALTER TABLE buckets 
ADD COLUMN IF NOT EXISTS last_question_type text;

COMMENT ON COLUMN buckets.last_question_type IS 'Tracks conversational context: work_type, hours, anything_else, project_confirm, project_select';
