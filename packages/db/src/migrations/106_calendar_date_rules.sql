-- Copyright © 2026–Present ClearKey Solutions, LLC.
-- Proprietary & Confidential. Internal Use Only.
--
-- 106_calendar_date_rules.sql
-- Admin booking calendar: per-date operational rules (blocks, price
-- adjustments, automatic date coupons), optionally scoped to one service area.
--
-- A rule row applies to exactly ONE calendar date (bulk creation in the admin
-- UI expands ranges/weekday selections into individual rows server-side, so
-- every applied date is a first-class, auditable, individually revocable row).
-- Dates are matched against the CUSTOMER'S LOCAL calendar date of a booking
-- (the date the customer picked in the wizard), not the UTC date of the
-- scheduled instant — see apps/api/src/lib/localDate.ts.
--
-- Scope: service_area_id NULL = platform-wide; set = that service area only
-- (resolved from the booking address's lat/lng against service_areas
-- polygons). Stacking semantics (enforced by uq_calendar_date_rules_scope and
-- apps/api/src/lib/calendarRules.ts):
--   * at most ONE active rule per (date, scope, kind);
--   * for price_adjustment and coupon, an area-specific rule OVERRIDES a
--     platform-wide rule on the same date (they never stack);
--   * for block, platform-wide and area rules union (either one blocks).
--
-- Kinds:
--   * block            — the date accepts no NEW bookings/reschedules. Existing
--                        bookings are untouched; the admin calendar surfaces
--                        them as conflicts for manual action.
--   * price_adjustment — adjustment_type 'percent' (adjustment_value = whole
--                        percent, e.g. 10 = +10%, -15 = 15% off) or 'flat'
--                        (adjustment_value = integer CENTS, negative =
--                        discount). Applied server-side to the pre-tax service
--                        subtotal after any engine minimum, on BOTH the legacy
--                        chain and Pricing v2 (see bookings.ts
--                        computeBookingPricing).
--   * coupon           — an automatic date promotion. The rule carries a
--                        coupon TEMPLATE (coupons are per-user grants in this
--                        codebase, not shared codes — see lib/coupons.ts): on
--                        a matching booking a one-use coupon is minted for the
--                        customer (source 'calendar', source_ref = rule id,
--                        once per customer per rule) and then competes in the
--                        existing best-coupon auto-apply engine, so a better
--                        coupon the customer already holds still wins and the
--                        same coupon can never stack twice.

-- ── Calendar date rules ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_date_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_date        DATE NOT NULL,
  -- NULL = platform-wide; otherwise scoped to one service area.
  service_area_id  UUID REFERENCES service_areas(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('block', 'price_adjustment', 'coupon')),
  -- price_adjustment payload (NULL for other kinds).
  adjustment_type  TEXT CHECK (adjustment_type IS NULL OR adjustment_type IN ('percent', 'flat')),
  adjustment_value INTEGER,
  -- coupon template payload (NULL for other kinds). Percent value is 1–100;
  -- amount value is integer cents.
  coupon_kind      TEXT CHECK (coupon_kind IS NULL OR coupon_kind IN ('percent_off', 'amount_off')),
  coupon_value     INTEGER,
  -- Customer-facing label for price_adjustment/coupon rules (shown on the
  -- quote breakdown / availability endpoint); display label for blocks in the
  -- admin UI only. Keep it presentable.
  label            TEXT NOT NULL,
  -- Internal admin note. NEVER sent to customers.
  reason           TEXT,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Clerk id of the creating admin (matches the admin_audit_log actor format).
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each kind carries exactly its own payload.
  CHECK (kind <> 'price_adjustment' OR (
    adjustment_type IS NOT NULL AND adjustment_value IS NOT NULL AND adjustment_value <> 0
    AND coupon_kind IS NULL AND coupon_value IS NULL
  )),
  CHECK (kind <> 'coupon' OR (
    coupon_kind IS NOT NULL AND coupon_value IS NOT NULL AND coupon_value > 0
    AND adjustment_type IS NULL AND adjustment_value IS NULL
  )),
  CHECK (kind <> 'block' OR (
    adjustment_type IS NULL AND adjustment_value IS NULL
    AND coupon_kind IS NULL AND coupon_value IS NULL
  )),
  -- Percent bounds: never below -90% (a bigger discount is a config mistake)
  -- and never above +300%.
  CHECK (adjustment_type IS DISTINCT FROM 'percent' OR (adjustment_value BETWEEN -90 AND 300)),
  CHECK (coupon_kind IS DISTINCT FROM 'percent_off' OR (coupon_value BETWEEN 1 AND 100))
);

-- Stacking guard: at most one ACTIVE rule per (date, scope, kind). NULL scope
-- is folded to the zero uuid so two platform-wide rules of the same kind on
-- the same date conflict (unique indexes treat NULLs as distinct otherwise).
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_date_rules_scope
  ON calendar_date_rules (
    rule_date,
    COALESCE(service_area_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind
  )
  WHERE active;

-- Range queries (admin month grid, availability endpoint, booking checks).
CREATE INDEX IF NOT EXISTS idx_calendar_date_rules_date
  ON calendar_date_rules (rule_date) WHERE active;
CREATE INDEX IF NOT EXISTS idx_calendar_date_rules_area
  ON calendar_date_rules (service_area_id, rule_date) WHERE active;

COMMENT ON TABLE calendar_date_rules IS
  'Admin booking-calendar rules: one row per (date, scope, kind). block stops new bookings/reschedules on that local date; price_adjustment layers a labeled percent/flat operational adjustment onto the server quote; coupon auto-mints a per-customer coupon for bookings on that date. service_area_id NULL = platform-wide.';

-- ── Date-coupon claim lock ───────────────────────────────────────────────────
-- Mirrors migration 088's strict one-claim-per-identity locks for a new coupon
-- source 'calendar' (source_ref = calendar_date_rules.id): each customer can
-- be granted a given date-rule's coupon at most once, race-safe at the DB.
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_source_user_once_calendar
  ON coupons (source, source_ref, user_id)
  WHERE user_id IS NOT NULL AND source = 'calendar';

-- ── RLS parity (owner-bypass; matches migrations 089/100/104/105) ────────────
ALTER TABLE calendar_date_rules ENABLE ROW LEVEL SECURITY;
