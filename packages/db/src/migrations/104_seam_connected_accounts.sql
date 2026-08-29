-- Copyright © 2026–Present ClearKey Solutions, LLC.
-- Proprietary & Confidential. Internal Use Only.
--
-- 104_seam_connected_accounts.sql
-- Per-customer Seam Connected Accounts + webhook dedup + device isolation.
--
-- BACKGROUND (docs/seam-audit.md §1.2, §1.7#1/#2, §3): the original Smart Entry
-- MVP assumed a SINGLE Seam workspace connection and listed EVERY device in the
-- workspace, attributing them all to whichever customer called /devices/sync —
-- a cross-customer leak. It also had no Connect Webview onboarding, so customer
-- locks were never actually linked and PINs were never provisioned.
--
-- This migration introduces the Seam `connected_account` primitive: a Sweepr
-- user authorizes their smart-lock provider (or Airbnb) through Seam's hosted
-- Connect Webview, which yields a `connected_account` we scope every device
-- lookup to. One canonical `users` row can map to N connected accounts (e.g. a
-- Schlage account AND an Airbnb account).

-- ── Seam connected accounts (one row per user⇄Seam connected_account) ─────────
CREATE TABLE IF NOT EXISTS seam_connected_accounts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The Seam connected_account id. NULL while the Connect Webview is still
  -- pending (authorization not yet completed). Populated on success.
  seam_connected_account_id TEXT,
  -- The Connect Webview we opened for this link — used to poll status and to
  -- correlate the connected_account.* webhook back to this row.
  connect_webview_id        TEXT,
  -- 'seam' = a smart-lock brand link (August/Yale/Schlage/…); 'airbnb' = an
  -- Airbnb link established via Seam (distinct from the .ics calendar sync in
  -- calendar_sources — see routes/smartEntry.ts airbnb endpoints).
  provider                  TEXT NOT NULL DEFAULT 'seam',
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','connected','disconnected','error')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, seam_connected_account_id)
);
CREATE INDEX IF NOT EXISTS idx_seam_connected_accounts_user
  ON seam_connected_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_seam_connected_accounts_webview
  ON seam_connected_accounts (connect_webview_id);

COMMENT ON TABLE seam_connected_accounts IS
  'Maps a Sweepr user to their Seam connected_account(s). A pending row holds only the connect_webview_id until the hosted authorization completes; provider distinguishes a smart-lock brand link from an Airbnb link.';

-- ── Seam webhook dedup (idempotency / replay protection) ──────────────────────
-- Seam signs webhooks with Svix; deliveries can be retried/replayed. We claim a
-- dedup row keyed on the Seam event_id (or a hash of the raw body) with
-- INSERT … ON CONFLICT DO NOTHING RETURNING before doing any work — mirrors the
-- stripe_events / yardstik_webhook_events pattern.
CREATE TABLE IF NOT EXISTS seam_webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key    TEXT UNIQUE NOT NULL,
  event_type   TEXT,
  resource_id  TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seam_webhook_events_received
  ON seam_webhook_events (received_at);

-- ── Device isolation fix (audit §1.7#2) ──────────────────────────────────────
-- Without a real unique key the /devices/sync `ON CONFLICT DO NOTHING` silently
-- did nothing (no arbiter) and duplicate device rows were possible once more
-- than one lock existed. A device is unique within its connection.
ALTER TABLE smart_lock_devices
  DROP CONSTRAINT IF EXISTS smart_lock_devices_conn_ref_uniq;
ALTER TABLE smart_lock_devices
  ADD CONSTRAINT smart_lock_devices_conn_ref_uniq
  UNIQUE (connection_id, provider_device_reference);

-- Scope a smart_lock_connections row to one Seam connected_account per customer
-- so we can upsert (customer_id, provider_account_reference) deterministically.
ALTER TABLE smart_lock_connections
  DROP CONSTRAINT IF EXISTS smart_lock_connections_customer_account_uniq;
ALTER TABLE smart_lock_connections
  ADD CONSTRAINT smart_lock_connections_customer_account_uniq
  UNIQUE (customer_id, provider_account_reference);

-- ── RLS parity (owner-bypass; matches migrations 089/100/101) ────────────────
ALTER TABLE seam_connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE seam_webhook_events     ENABLE ROW LEVEL SECURITY;
