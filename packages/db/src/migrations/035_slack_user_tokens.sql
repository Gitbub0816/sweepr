-- Migration 035: per-user Slack tokens for the embedded workspace.
--
-- The embedded Slack tab renders each admin's *own* Slack view, so we store a
-- user OAuth token (xoxp-) per linked Slack account. Slack permissions are
-- enforced by Slack (the token only sees what that user can see); Sweepr
-- permissions are enforced separately at the route layer.

ALTER TABLE slack_user_links
  ADD COLUMN IF NOT EXISTS user_token   TEXT,
  ADD COLUMN IF NOT EXISTS user_scopes  TEXT,
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;

-- Distinguish bot-install OAuth from personal-connect OAuth on the same callback.
ALTER TABLE slack_oauth_states
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'install';
