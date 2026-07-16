-- Copyright © 2026–Present ClearKey Solutions, LLC.
-- All Rights Reserved.
--
-- Proprietary and Confidential.
--
-- Unauthorized copying, modification, disclosure,
-- distribution, reverse engineering, or use is prohibited.

-- Admin-managed, ZIP-code-specific pricing adjustment applied to a booking's
-- base total before the platform fee is split out. A positive percentage
-- increases the total (both what the customer pays and, proportionally, what
-- the cleaner earns); a negative percentage reduces it the same way — this is
-- the same mechanism as the existing cleaning-level and rush-hour surcharges,
-- not a fee-only adjustment like the Founding Member customer discount.
CREATE TABLE IF NOT EXISTS zip_pricing_multipliers (
  zip TEXT PRIMARY KEY,
  multiplier_pct NUMERIC(6,2) NOT NULL CHECK (multiplier_pct BETWEEN -90 AND 500),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by_clerk_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Snapshot the applied adjustment on the booking, like every other price
-- component, so a later admin change to the ZIP table never rewrites what a
-- customer already agreed to pay for a booking already on the books.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS zip_pricing_adjustment_cents INT NOT NULL DEFAULT 0;
