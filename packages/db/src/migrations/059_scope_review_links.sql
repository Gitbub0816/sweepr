-- Migration 059: Scope review secure action links.
--
-- Single-use, signed email-action tokens for admin approve/deny of a scope
-- review request straight from the notification email (no dashboard login).
-- Modeled on `fee_change_action_links` (migration 034): the raw token is never
-- stored — only its sha256 hash — and each link is single-use + time-bounded.

CREATE TABLE IF NOT EXISTS scope_review_action_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES scope_review_requests(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK (action IN ('approve', 'deny')),
  token_hash  TEXT NOT NULL,               -- sha256 of the raw token; raw never stored
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  used_by     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scope_review_action_links_token ON scope_review_action_links (token_hash);
CREATE INDEX IF NOT EXISTS idx_scope_review_action_links_request ON scope_review_action_links (request_id);
