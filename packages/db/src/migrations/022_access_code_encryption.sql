-- Migration 022: Access code encryption + address reveal audit

ALTER TABLE booking_access_codes
  ADD COLUMN IF NOT EXISTS code_value_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS encryption_version    TEXT DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS revealed_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revealed_to           UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_booking_access_codes_booking ON booking_access_codes(booking_id);

-- Address reveal audit columns on bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS address_revealed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS address_revealed_to     UUID REFERENCES users(id);
