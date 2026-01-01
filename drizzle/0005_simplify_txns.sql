-- Simplify transactions table
-- Remove estimated_revenue, add time, labor, material fields

-- Drop existing column
ALTER TABLE txns DROP COLUMN IF EXISTS estimated_revenue;

-- Add new columns
ALTER TABLE txns ADD COLUMN time NUMERIC(10, 2); -- hours worked
ALTER TABLE txns ADD COLUMN labor TEXT; -- labor description
ALTER TABLE txns ADD COLUMN material TEXT; -- materials used

-- Make bucket_id NOT NULL since every txn should come from a bucket
ALTER TABLE txns ALTER COLUMN bucket_id SET NOT NULL;
