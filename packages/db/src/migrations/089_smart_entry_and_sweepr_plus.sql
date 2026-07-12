-- Copyright © 2026–Present ClearKey Solutions, LLC.
-- Proprietary & Confidential. Internal Use Only.
--
-- Sweepr Smart Entry + Sweepr+ membership.
--
-- Smart Entry gives an assigned, verified cleaner *temporary*, booking-specific
-- access to a customer's home. A working credential (door code / digital key /
-- unlock command) must NEVER be exposed merely because it exists or because a
-- cleaner is assigned — every reveal/unlock passes a fresh server-side
-- authorization decision (see lib/homeAccess.ts). Plaintext credentials are
-- never stored here; only envelope-encrypted references (see lib/crypto.ts).

-- ── Sweepr+ membership ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sweepr_plus_memberships (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Stripe subscription lifecycle. Benefits are active only when Stripe reports
  -- the subscription active/trialing (never on a bare authorization).
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT UNIQUE,
  stripe_price_id         TEXT,
  interval                TEXT CHECK (interval IN ('month','year')),
  status                  TEXT NOT NULL DEFAULT 'incomplete'
                            CHECK (status IN ('incomplete','trialing','active','past_due','canceled','incomplete_expired','unpaid')),
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
  current_period_end      TIMESTAMPTZ,
  grace_until             TIMESTAMPTZ,           -- past_due grace window
  -- Rolling benefit accounting.
  discount_cents_this_month INTEGER NOT NULL DEFAULT 0,
  discount_month_key      TEXT,                  -- 'YYYY-MM' the counter belongs to
  last_reschedule_waived_at TIMESTAMPTZ,         -- one waiver / 90 days
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One live membership row per user (historical canceled rows allowed).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sweepr_plus_active_user
  ON sweepr_plus_memberships (user_id)
  WHERE status IN ('trialing','active','past_due');

-- A membership is "benefit-eligible" when active/trialing, or past_due within
-- its grace window. Server code is the source of truth; this is a convenience.

-- ── Smart-lock connections & devices (per spec §16) ──────────────────────────
CREATE TABLE IF NOT EXISTS smart_lock_connections (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id                 UUID REFERENCES addresses(id) ON DELETE SET NULL,
  provider                    TEXT NOT NULL DEFAULT 'seam',
  provider_account_reference  TEXT,              -- e.g. Seam connected_account id
  encrypted_provider_token_reference TEXT,       -- vault/secret pointer, never a raw token
  status                      TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','connected','revoked','error')),
  connected_at                TIMESTAMPTZ,
  revoked_at                  TIMESTAMPTZ,
  last_health_check_at        TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_smart_lock_conn_customer ON smart_lock_connections (customer_id);

CREATE TABLE IF NOT EXISTS smart_lock_devices (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id             UUID NOT NULL REFERENCES smart_lock_connections(id) ON DELETE CASCADE,
  property_id               UUID REFERENCES addresses(id) ON DELETE SET NULL,
  provider_device_reference TEXT NOT NULL,
  display_name              TEXT,
  device_type               TEXT,
  supports_remote_unlock    BOOLEAN NOT NULL DEFAULT FALSE,
  supports_remote_lock      BOOLEAN NOT NULL DEFAULT FALSE,
  supports_temporary_codes  BOOLEAN NOT NULL DEFAULT FALSE,
  supports_scheduled_codes  BOOLEAN NOT NULL DEFAULT FALSE,
  supports_lock_status      BOOLEAN NOT NULL DEFAULT FALSE,
  status                    TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','offline','removed')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_smart_lock_device_conn ON smart_lock_devices (connection_id);

-- ── Per-booking access authorization + credentials ───────────────────────────
CREATE TABLE IF NOT EXISTS booking_access_authorizations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id            UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id           UUID REFERENCES addresses(id) ON DELETE SET NULL,
  lock_device_id        UUID REFERENCES smart_lock_devices(id) ON DELETE SET NULL,
  -- Selected access method for the booking (spec §6).
  access_method         TEXT NOT NULL DEFAULT 'home'
                          CHECK (access_method IN ('home','keypad_code','smart_entry','lockbox','front_desk','other')),
  access_starts_at      TIMESTAMPTZ,
  access_ends_at        TIMESTAMPTZ,
  geofence_radius_meters INTEGER NOT NULL DEFAULT 150,
  -- Explicit, versioned consent (spec §7).
  customer_authorized_at TIMESTAMPTZ,
  consent_version       TEXT,
  consent_ip            TEXT,
  consent_session_id    TEXT,
  revoked_at            TIMESTAMPTZ,
  revocation_reason     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_access_credentials (
  id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  authorization_id              UUID NOT NULL REFERENCES booking_access_authorizations(id) ON DELETE CASCADE,
  credential_type               TEXT NOT NULL
                                  CHECK (credential_type IN ('customer_pin','generated_pin','remote_unlock','digital_key','instructions')),
  -- Envelope-encrypted; PLAINTEXT MUST NEVER BE STORED HERE.
  encrypted_credential          TEXT,
  provider_credential_reference TEXT,           -- e.g. Seam access_code id
  credential_status             TEXT NOT NULL DEFAULT 'pending'
                                  CHECK (credential_status IN ('pending','active','expired','revoked','destroyed')),
  activates_at                  TIMESTAMPTZ,
  expires_at                    TIMESTAMPTZ,
  last_revealed_at              TIMESTAMPTZ,
  reveal_count                  INTEGER NOT NULL DEFAULT 0,
  destroyed_at                  TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bac_credentials_auth ON booking_access_credentials (authorization_id);

-- ── Immutable access-event log (spec §16) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS home_access_events (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id                UUID REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id               UUID REFERENCES users(id) ON DELETE SET NULL,
  cleaner_id                UUID REFERENCES users(id) ON DELETE SET NULL,
  property_id               UUID REFERENCES addresses(id) ON DELETE SET NULL,
  device_id                 UUID REFERENCES smart_lock_devices(id) ON DELETE SET NULL,
  event_type                TEXT NOT NULL,       -- reveal_requested, unlock_requested, unlocked, locked, denied, revoked, code_created …
  decision                  TEXT,                -- allowed | denied
  denial_reason             TEXT,
  provider_event_reference  TEXT,
  location_distance_meters  DOUBLE PRECISION,
  location_accuracy_meters  DOUBLE PRECISION,
  session_id                TEXT,
  ip_address                TEXT,
  device_reference          TEXT,
  occurred_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata                  JSONB               -- sanitized: NEVER a credential or provider secret
);
CREATE INDEX IF NOT EXISTS idx_home_access_events_booking ON home_access_events (booking_id);
CREATE INDEX IF NOT EXISTS idx_home_access_events_cleaner ON home_access_events (cleaner_id, occurred_at DESC);

-- ── Booking columns for the selected access method + Smart Entry billing ──────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS access_method TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS smart_entry_fee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sweepr_plus_discount_cents INTEGER NOT NULL DEFAULT 0;

-- ── Price-ledger: admit Smart Entry fee + Sweepr+ discount ───────────────────
ALTER TABLE booking_price_ledger DROP CONSTRAINT IF EXISTS booking_price_ledger_event_type_check;
ALTER TABLE booking_price_ledger ADD CONSTRAINT booking_price_ledger_event_type_check
  CHECK (event_type IN (
    'initial_quote', 'addon_purchase', 'level_surcharge', 'additional_attention_fee',
    'refusal_fee', 'admin_adjustment', 'tax_adjustment', 'coupon_discount',
    'smart_entry_fee', 'membership_discount'
  ));

-- ── RLS parity with the rest of the schema ───────────────────────────────────
ALTER TABLE sweepr_plus_memberships        ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_lock_connections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_lock_devices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_access_authorizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_access_credentials     ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_access_events             ENABLE ROW LEVEL SECURITY;
