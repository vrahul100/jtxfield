-- Migration: Add batch messaging and activity tracking to members table
ALTER TABLE members 
ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pending_item_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_ticket_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_summary_sent_at TIMESTAMPTZ;

-- Drop obsolete subscription_tier column and index if they exist
DROP INDEX IF EXISTS idx_members_basic_pending;
ALTER TABLE members DROP COLUMN IF EXISTS subscription_tier;
