/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- 079_admin_alerting.sql
-- Admin alerting & notification system.
--
-- admin_alert_prefs      per-admin channel toggles (in-app / email / SMS) per
--                        alert category; absent rows fall back to code-side
--                        defaults (apps/api/src/lib/adminAlerts.ts).
-- admin_notifications    the admin notification feed backing the bell and the
--                        sidebar unread badges.
-- admin_alert_contacts   one SMS number per admin, self-configured in their
--                        alert preferences (users.phone is not set for admins).

CREATE TABLE IF NOT EXISTS admin_alert_prefs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  channel    TEXT NOT NULL CHECK (channel IN ('email','sms','inapp')),
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, category, channel)
);

ALTER TABLE admin_alert_prefs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS admin_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link_path  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_user_read
  ON admin_notifications (user_id, read_at);

-- Backs the 30-minute dedupe lookup in alertAdmins.
CREATE INDEX IF NOT EXISTS idx_admin_notifications_category_time
  ON admin_notifications (category, created_at DESC);

ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS admin_alert_contacts (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sms_phone  TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_alert_contacts ENABLE ROW LEVEL SECURITY;
