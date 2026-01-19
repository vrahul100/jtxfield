-- Add conversation tracking columns for v2 state machine

ALTER TABLE buckets 
ADD COLUMN IF NOT EXISTS conversation_state text;

ALTER TABLE buckets 
ADD COLUMN IF NOT EXISTS state_attempts integer DEFAULT 0;

COMMENT ON COLUMN buckets.conversation_state IS 'XState v2: collecting_work, asking_more, confirming_project, selecting_project, complete';
COMMENT ON COLUMN buckets.state_attempts IS 'Track attempts in current state for retry logic (max 2)';
