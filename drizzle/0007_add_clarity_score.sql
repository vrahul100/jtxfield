-- Add clarity_score column to buckets
ALTER TABLE buckets ADD COLUMN clarity_score NUMERIC DEFAULT 0.5;
