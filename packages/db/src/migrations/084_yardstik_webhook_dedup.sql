/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- 084_yardstik_webhook_dedup.sql
-- Idempotency / replay protection for inbound Yardstik webhooks.
--
-- Yardstik does not sign a timestamp we can use for a freshness window, so a
-- captured (still-validly-signed) webhook could be replayed to re-drive a
-- cleaner's background-check status transition. We dedup on a stable event key
-- (the webhook body's `id` when present, else a SHA-256 hash of the raw body +
-- signature) the same way stripe_events dedups Stripe deliveries: the row is
-- claimed with INSERT … ON CONFLICT DO NOTHING RETURNING, and a delivery that
-- fails to claim a row is treated as a duplicate and skipped.

CREATE TABLE IF NOT EXISTS yardstik_webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key    TEXT UNIQUE NOT NULL,
  event        TEXT,
  resource_id  TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yardstik_webhook_events_received
  ON yardstik_webhook_events(received_at);
