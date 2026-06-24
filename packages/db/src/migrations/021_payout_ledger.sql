-- Migration 021: Payout ledger + stripe event idempotency

CREATE TABLE IF NOT EXISTS payout_ledger (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id              UUID REFERENCES bookings(id),
  cleaner_id              UUID REFERENCES cleaners(id),
  gross_amount_cents      INTEGER NOT NULL,
  platform_fee_cents      INTEGER NOT NULL,
  reserve_amount_cents    INTEGER NOT NULL DEFAULT 0,
  cleaner_payout_cents    INTEGER NOT NULL,
  fee_rate                NUMERIC(8,4),
  tier_multiplier         NUMERIC(4,3) DEFAULT 1.000,
  status                  TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','held','eligible','transfer_created','transferred','paid','failed','canceled','refunded','disputed')),
  stripe_payment_intent_id TEXT,
  stripe_charge_id        TEXT,
  stripe_transfer_id      TEXT,
  stripe_payout_id        TEXT,
  eligible_at             TIMESTAMPTZ,
  transferred_at          TIMESTAMPTZ,
  paid_at                 TIMESTAMPTZ,
  failed_at               TIMESTAMPTZ,
  failure_code            TEXT,
  failure_message         TEXT,
  dispute_id              TEXT,
  held_reason             TEXT,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_ledger_booking_unique ON payout_ledger(booking_id);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_cleaner ON payout_ledger(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_status ON payout_ledger(status);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_eligible_at ON payout_ledger(eligible_at) WHERE eligible_at IS NOT NULL;

-- Stripe event idempotency table
CREATE TABLE IF NOT EXISTS stripe_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id  TEXT UNIQUE NOT NULL,
  event_type       TEXT NOT NULL,
  payload          JSONB NOT NULL,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ,
  processing_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_received ON stripe_events(received_at DESC);
