-- Migration 025: Production hardening — completion requirements, webhook DLQ,
--                address reveal config, booking auth indexes

-- ─── Job Completion Requirements ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_completion_requirements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  minimum_before_photos INTEGER NOT NULL DEFAULT 3,
  minimum_after_photos  INTEGER NOT NULL DEFAULT 3,
  require_checkout_photo BOOLEAN NOT NULL DEFAULT TRUE,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by            UUID REFERENCES users(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO job_completion_requirements
  (minimum_before_photos, minimum_after_photos, require_checkout_photo, active)
VALUES (3, 3, TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- ─── Address Reveal Configuration ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS address_reveal_settings (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reveal_hours_before        INTEGER NOT NULL DEFAULT 4,   -- how many hours before scheduled start
  allow_same_day_only        BOOLEAN NOT NULL DEFAULT TRUE,
  active                     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by                 UUID REFERENCES users(id),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO address_reveal_settings (reveal_hours_before, allow_same_day_only, active)
VALUES (4, TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- ─── Failed Webhook Dead-Letter Queue ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS failed_webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  error_message   TEXT NOT NULL,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  last_retry_at   TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failed_webhook_events_unresolved
  ON failed_webhook_events(created_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_failed_webhook_events_stripe_id
  ON failed_webhook_events(stripe_event_id);

-- ─── Add columns to stripe_events for DLQ tracking ───────────────────────────
ALTER TABLE stripe_events
  ADD COLUMN IF NOT EXISTS retry_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error      TEXT;

-- ─── Payment intent idempotency — track created intents ──────────────────────
-- Prevents the same bookingId from getting two PaymentIntents
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_created_at TIMESTAMPTZ;

-- ─── Access code — ensure encrypted column exists ────────────────────────────
ALTER TABLE booking_access_codes
  ADD COLUMN IF NOT EXISTS code_value_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS encryption_version   TEXT DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS revealed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revealed_to          UUID REFERENCES users(id);

-- Make code_value nullable (will be NULL once encryption is live)
ALTER TABLE booking_access_codes
  ALTER COLUMN code_value DROP NOT NULL;
