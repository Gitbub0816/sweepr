-- Copyright © 2026–Present ClearKey Solutions, LLC. All Rights Reserved.
-- Proprietary and Confidential.

-- ============================================================================
-- Coupon stacking permissions + strict one-claim-per-identity locks
-- ============================================================================

-- Per-coupon stacking permissions:
--   stackable = FALSE → the coupon applies alone (default).
--   stackable = TRUE  → may combine with other stackable coupons on one booking.
--   max_stack         → cap on how many coupons total may participate in a stack
--                       this coupon is part of (NULL = no cap it imposes).
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS stackable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_stack INTEGER;

-- Redemptions: a booking may now consume MULTIPLE coupons (a stack), but any
-- individual coupon still applies to a given booking at most once.
ALTER TABLE coupon_redemptions DROP CONSTRAINT IF EXISTS coupon_redemptions_booking_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_redemption_once
  ON coupon_redemptions (coupon_id, booking_id);

-- STRICT claim locks: one coupon per identity per promo/milestone, enforced at
-- the database (the promo-claims dedup is the first line; this closes every
-- other path). Applies to both signed-in (user_id) and email-bound claims.
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_source_user_once
  ON coupons (source, source_ref, user_id)
  WHERE user_id IS NOT NULL AND source IN ('promo', 'milestone');
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_source_email_once
  ON coupons (source, source_ref, LOWER(email))
  WHERE email IS NOT NULL AND source IN ('promo', 'milestone');
