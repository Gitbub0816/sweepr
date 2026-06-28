-- Migration 033: Slack workspace integration.
--
-- Sweepr remains the source of truth. Slack is a notification/collaboration
-- interface. These tables store workspace connections (OAuth tokens), mapped
-- channels, OAuth CSRF state, and a posted-message registry so approval cards
-- can be updated in place.

-- ── Connected Slack workspaces ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slack_workspaces (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          TEXT NOT NULL UNIQUE,        -- Slack workspace (team) id
  team_name        TEXT,
  app_id           TEXT,
  bot_user_id      TEXT,
  bot_token        TEXT NOT NULL,               -- xoxb- token (secret)
  scope            TEXT,
  authed_user_id   TEXT,                         -- Slack user who installed
  installed_by     TEXT,                         -- Sweepr clerk id of installer
  incoming_webhook_url TEXT,                      -- optional, if requested
  status           TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','revoked','error')),
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Mapped Slack channels ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slack_channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES slack_workspaces(id) ON DELETE CASCADE,
  channel_id   TEXT NOT NULL,
  channel_name TEXT,
  -- Logical purpose this channel serves in Sweepr routing.
  purpose      TEXT NOT NULL DEFAULT 'custom'
    CHECK (purpose IN ('approvals','admin','operations','finance','it','training','custom')),
  is_private   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, channel_id)
);
CREATE INDEX IF NOT EXISTS idx_slack_channels_ws ON slack_channels (workspace_id);
CREATE INDEX IF NOT EXISTS idx_slack_channels_purpose ON slack_channels (purpose);

-- ── OAuth CSRF state (short-lived) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slack_oauth_states (
  state       TEXT PRIMARY KEY,
  created_by  TEXT,                              -- Sweepr clerk id
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- ── Posted message registry (so cards can be updated in place) ───────────────
CREATE TABLE IF NOT EXISTS slack_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES slack_workspaces(id) ON DELETE CASCADE,
  channel_id   TEXT NOT NULL,
  message_ts   TEXT NOT NULL,                    -- Slack message timestamp (id)
  ref_type     TEXT,                             -- e.g. 'fee_proposal', 'pricing_proposal'
  ref_id       TEXT,                             -- related Sweepr record id
  thread_ts    TEXT,                             -- collaboration thread root, if any
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_slack_messages_ref ON slack_messages (ref_type, ref_id);

-- ── Map Slack users to Sweepr users (for permission checks on actions) ───────
CREATE TABLE IF NOT EXISTS slack_user_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES slack_workspaces(id) ON DELETE CASCADE,
  slack_user_id TEXT NOT NULL,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  email         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, slack_user_id)
);
