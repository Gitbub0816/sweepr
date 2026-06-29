-- Migration 039: log the in-app submitter on security tickets + report source.
ALTER TABLE security_tickets
  ADD COLUMN IF NOT EXISTS reporter_clerk_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'inbound_email';
