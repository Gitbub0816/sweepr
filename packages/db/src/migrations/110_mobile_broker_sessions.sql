-- Copyright © 2026–Present ClearKey Solutions, LLC.
-- Proprietary & Confidential. Internal Use Only.
--
-- Mobile app sessions for the central auth broker.
--
-- The iOS/Android apps sign in natively (Clerk proves WHO via its REST API),
-- then api.getsweepr.com — acting as the mobile BFF, since a phone can never
-- hold broker service keys — calls the broker's native exchange to mint a
-- per-app session. Unlike web sessions (72h absolute, cookie-held), mobile
-- sessions persist sign-in: a 60-day idle window that SLIDES on every
-- successful introspection, capped by an absolute 1-year bound. Web rows are
-- untouched: client_kind='web' keeps the never-extended absolute expiry.

ALTER TABLE app_sessions
  ADD COLUMN IF NOT EXISTS client_kind TEXT NOT NULL DEFAULT 'web'
    CHECK (client_kind IN ('web', 'mobile')),
  ADD COLUMN IF NOT EXISTS absolute_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN app_sessions.client_kind IS
  'web: cookie session, absolute expiry, never extended. mobile: keychain session minted via the broker native exchange; expires_at slides on introspection up to absolute_expires_at.';
COMMENT ON COLUMN app_sessions.absolute_expires_at IS
  'Hard cap for sliding (mobile) sessions; NULL for web sessions whose expires_at is already absolute.';
