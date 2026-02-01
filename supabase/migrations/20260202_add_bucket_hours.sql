-- Migration: Add hours column to buckets table for editing capability
-- Hours are extracted by AI and stored here for potential edits before creating timesheet

ALTER TABLE buckets 
ADD COLUMN IF NOT EXISTS hours NUMERIC;

COMMENT ON COLUMN buckets.hours IS 'Extracted hours worked - stored for editing capability before timesheet creation';
