-- Copyright © 2026–Present ClearKey Solutions, LLC. All Rights Reserved.
-- Proprietary and Confidential.

-- ============================================================================
-- Coupons engine + promo rewards + milestones
-- ============================================================================
-- Coupons are the actual perks (promos are the customer-facing vehicles).
-- They are SILENT: no widget — they sit on the person's account and apply
-- automatically to the next qualifying booking. Sign-up is required to hold
-- one (pre-signup claims bind to an email and attach at first sign-in), and
-- they default to 180-day validity (see legal Promotions & Coupons Terms).
-- ============================================================================

CREATE TABLE IF NOT EXISTS coupons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,          -- display code, e.g. SWPR-7K4QXH
  title         TEXT NOT NULL,                 -- "15% off your next booking"
  description   TEXT,
  theme         TEXT,                          -- valentines | christmas | … (display only)
  kind          TEXT NOT NULL CHECK (kind IN ('percent_off', 'amount_off', 'free_addon')),
  value         INTEGER NOT NULL DEFAULT 0,    -- percent (1-100) or cents; 0 for free_addon
  addon_key     TEXT,                          -- for kind=free_addon
  -- Ownership: user_id once signed up; email-only until then (attached on sign-in).
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  email         TEXT,
  source        TEXT NOT NULL DEFAULT 'admin', -- promo | milestone | theme | admin
  source_ref    TEXT,                          -- promo slug / milestone rule_key
  max_redemptions  INTEGER NOT NULL DEFAULT 1, -- one-time by default; >1 = multi-use
  redemption_count INTEGER NOT NULL DEFAULT 0,
  min_booking_total_cents INTEGER,             -- optional qualifying floor
  starts_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '180 days',
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'exhausted', 'expired', 'revoked')),
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_user_active
  ON coupons (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_coupons_email_pending
  ON coupons (LOWER(email)) WHERE user_id IS NULL AND status = 'active';

-- One coupon per booking; a redemption is the audit record of the application.
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id     UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  booking_id    UUID UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  amount_applied_cents INTEGER NOT NULL DEFAULT 0,
  addon_key     TEXT,
  redeemed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Milestones: "100th customer", "150th completed clean", "2 years as a cleaner"…
-- Each rule carries a coupon template (JSONB) minted for the subject when hit.
CREATE TABLE IF NOT EXISTS milestone_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key    TEXT UNIQUE NOT NULL,
  label       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN (
                'nth_customer', 'nth_cleaner', 'nth_completed_booking',
                'cleaner_anniversary_years', 'customer_anniversary_years')),
  threshold   INTEGER NOT NULL,                -- N (count) or years
  coupon      JSONB NOT NULL DEFAULT '{}'::jsonb, -- template: kind/value/addonKey/title/theme/validDays/maxRedemptions
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedup ledger: a rule fires at most once per subject.
CREATE TABLE IF NOT EXISTS milestone_awards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key     TEXT NOT NULL,
  subject_type TEXT NOT NULL,                  -- customer | cleaner | booking
  subject_id   UUID NOT NULL,
  coupon_id    UUID REFERENCES coupons(id) ON DELETE SET NULL,
  awarded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_key, subject_id)
);

-- Promotions gain a reward payload: what claiming actually GRANTS
-- (e.g. { coupon: { kind, value, addonKey, title, validDays, maxRedemptions,
--   minBookingTotalCents, offerMinutes } }). Founding grants stay on their own column.
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS reward JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The price ledger's event_type CHECK (mig. 058) must admit coupon discounts.
ALTER TABLE booking_price_ledger DROP CONSTRAINT IF EXISTS booking_price_ledger_event_type_check;
ALTER TABLE booking_price_ledger ADD CONSTRAINT booking_price_ledger_event_type_check
  CHECK (event_type IN (
    'initial_quote', 'addon_purchase', 'level_surcharge', 'additional_attention_fee',
    'refusal_fee', 'admin_adjustment', 'tax_adjustment', 'coupon_discount'
  ));

ALTER TABLE coupons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_awards   ENABLE ROW LEVEL SECURITY;
