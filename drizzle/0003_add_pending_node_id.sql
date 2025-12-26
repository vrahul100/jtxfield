-- Add pending_node_id column to members table
-- This stores the node ID that the member is being invited to join

ALTER TABLE members ADD COLUMN IF NOT EXISTS pending_node_id INTEGER REFERENCES nodes(id);

-- Update invitedBy to not reference members (it now references users table)
-- First drop the constraint if it exists, then the column will just be an integer
-- (No action needed if constraint doesn't exist)
