-- Copyright © 2026–Present ClearKey Solutions, LLC.
-- All Rights Reserved.
--
-- Proprietary and Confidential.
--
-- Unauthorized copying, modification, disclosure,
-- distribution, reverse engineering, or use is prohibited.

-- Founding customers get a permanent, lifetime platform-fee discount (default
-- 5%) applied to every booking total. The cleaner's payout is unaffected —
-- Sweepr absorbs the discount out of its own fee, never out of the cleaner's
-- earnings. Snapshotted per-booking (like every other price component) so a
-- later config change never rewrites what a customer already agreed to pay.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS founding_customer_discount_cents INT NOT NULL DEFAULT 0;
