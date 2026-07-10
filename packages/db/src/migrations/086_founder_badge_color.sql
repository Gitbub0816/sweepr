-- Copyright © 2026–Present ClearKey Solutions, LLC. All Rights Reserved.
-- Proprietary and Confidential.

-- Founding Member badge color. Each founder picks ONE of five colorways when
-- they claim their status (carbon-gold, rose-gold, classic-gold, seafoam-gold,
-- minimal-gold). The choice is permanent — locked_at records the moment it was
-- made and the API refuses any change after that. The badge artwork carries the
-- founder's first-name initial, which is INFERRED from first_name server-side
-- (never chosen), so only the color is stored.
ALTER TABLE cleaners
  ADD COLUMN IF NOT EXISTS founding_badge_color     TEXT,
  ADD COLUMN IF NOT EXISTS founding_badge_locked_at TIMESTAMPTZ;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS founding_badge_color     TEXT,
  ADD COLUMN IF NOT EXISTS founding_badge_locked_at TIMESTAMPTZ;
