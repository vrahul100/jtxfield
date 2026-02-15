-- Add pending_correction JSONB column to members table
-- Stores pending ticket correction awaiting user confirmation
-- Example: {"bucket_id": 122, "action": "change_project", "value": "City Mall", "resolved_project_id": 5, "created_at": "..."}
ALTER TABLE members ADD COLUMN IF NOT EXISTS pending_correction JSONB DEFAULT NULL;
