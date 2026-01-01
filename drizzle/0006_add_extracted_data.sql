-- Add extracted_data column to store AI extraction results
ALTER TABLE buckets ADD COLUMN extracted_data JSONB;

-- This will store the full extraction result including:
-- hoursWorked, workType, materialsUsed, workersCount, location, etc.
