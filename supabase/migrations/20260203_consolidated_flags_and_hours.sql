-- Consolidated migration: Add all missing columns for flag propagation and hours editing
-- This migration adds:
-- 1. potential_change to buckets and txns (for change order flagging)
-- 2. time to txns (for hours worked)
-- 3. hours to buckets (for hours editing before submission)

-- Add potential_change flag to buckets table for tracking scope changes
ALTER TABLE buckets ADD COLUMN IF NOT EXISTS potential_change BOOLEAN DEFAULT FALSE;

-- Add potential_change flag to txns table (inherited from bucket)
ALTER TABLE txns ADD COLUMN IF NOT EXISTS potential_change BOOLEAN DEFAULT FALSE;

-- Add time column to txns for storing hours worked
ALTER TABLE txns ADD COLUMN IF NOT EXISTS time NUMERIC;

-- Add hours column to buckets for editing capability
ALTER TABLE buckets ADD COLUMN IF NOT EXISTS hours NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN buckets.potential_change IS 'Manually toggleable flag to mark work that may indicate a scope change';
COMMENT ON COLUMN txns.potential_change IS 'Inherited from bucket - indicates timesheet is linked to a potential scope change';
COMMENT ON COLUMN txns.time IS 'Hours worked - numeric value for precise tracking';
COMMENT ON COLUMN buckets.hours IS 'Extracted hours worked - stored for editing capability before timesheet creation';
