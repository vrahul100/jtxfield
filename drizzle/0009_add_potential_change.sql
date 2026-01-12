-- Add potential_change flag to buckets table for tracking scope changes
ALTER TABLE buckets ADD COLUMN IF NOT EXISTS potential_change BOOLEAN DEFAULT FALSE;

-- Add potential_change flag to txns table (linked from bucket)
ALTER TABLE txns ADD COLUMN IF NOT EXISTS potential_change BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN buckets.potential_change IS 'Manually toggleable flag to mark work that may indicate a scope change';
COMMENT ON COLUMN txns.potential_change IS 'Inherited from bucket - indicates timesheet is linked to a potential scope change';
