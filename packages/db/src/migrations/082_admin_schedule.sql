-- Copyright © 2026–Present ClearKey Solutions, LLC. All Rights Reserved.
-- Proprietary and Confidential.

-- 1) Rich inbound email: keep the sanitized HTML body alongside the plain-text
--    fallback so the admin Mail tab can render real formatting + clickable links.
ALTER TABLE mailbox_messages ADD COLUMN IF NOT EXISTS body_html TEXT;

-- 2) Admin schedule calendar. Events are either plain notes (kind='note') or
--    automations (kind='automation') that the cron executes at starts_at:
--    broadcasts/newsletters, status announcements, service-area launches,
--    prelaunch gate toggles, admin alerts, …
CREATE TABLE IF NOT EXISTS scheduled_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT,
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ,
  all_day        BOOLEAN NOT NULL DEFAULT FALSE,
  kind           TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'automation')),
  action_type    TEXT,
  action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- scheduled → executed | failed | canceled (notes stay 'scheduled')
  status         TEXT NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled', 'executed', 'failed', 'canceled')),
  executed_at    TIMESTAMPTZ,
  result_note    TEXT,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_events_due
  ON scheduled_events (starts_at)
  WHERE status = 'scheduled' AND kind = 'automation';
CREATE INDEX IF NOT EXISTS idx_scheduled_events_range
  ON scheduled_events (starts_at DESC);

ALTER TABLE scheduled_events ENABLE ROW LEVEL SECURITY;
