-- Migration: Add subscription tiers and batch messaging tracking to members table
ALTER TABLE members 
ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'pro' CHECK (subscription_tier IN ('basic', 'pro')),
ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pending_item_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_ticket_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_summary_sent_at TIMESTAMPTZ;

-- Index for quick cron querying of basic tier members with pending items
CREATE INDEX IF NOT EXISTS idx_members_basic_pending 
ON members (subscription_tier, pending_item_count) 
WHERE subscription_tier = 'basic' AND pending_item_count > 0;
