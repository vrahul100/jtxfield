-- Migration: Add labor, material, and location columns to txns table
-- These columns store detailed work information extracted by AI

ALTER TABLE txns 
ADD COLUMN IF NOT EXISTS labor TEXT,
ADD COLUMN IF NOT EXISTS material TEXT,
ADD COLUMN IF NOT EXISTS location TEXT;

COMMENT ON COLUMN txns.labor IS 'Detailed description of labor/work performed';
COMMENT ON COLUMN txns.material IS 'Materials used (comma-separated list)';
COMMENT ON COLUMN txns.location IS 'Work location/area';
