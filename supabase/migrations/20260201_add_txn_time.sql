-- Migration: Add time column to txns table to store hours worked
-- This is CRITICAL - hours must be stored as a numeric value, not just in descriptive fields

ALTER TABLE txns 
ADD COLUMN IF NOT EXISTS time NUMERIC;

COMMENT ON COLUMN txns.time IS 'Hours worked (extracted from user input, e.g., 6.5)';
