-- Copyright © 2026–Present ClearKey Solutions, LLC. All Rights Reserved.
-- Proprietary and Confidential.

-- ============================================================================
-- Founding Member Program + Promotions Engine
-- ============================================================================
-- Two related feature sets:
--   1) Founding Member status for cleaners AND customers — a permanent,
--      one-time designation with a sequential founder number, lifetime perks
--      (5% cleaner earnings bonus), and revoke/restore controls.
--   2) A promotions engine whose "founding member" templates are the funnel
--      that grants that status. Promotions are self-contained rows (design +
--      CTA + display + expiry as JSONB) addressable by a public slug URL.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Founding Member columns — cleaners
-- ---------------------------------------------------------------------------
ALTER TABLE cleaners
  ADD COLUMN IF NOT EXISTS founding_member                BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS founding_member_id             INTEGER,      -- sequential founder #
  ADD COLUMN IF NOT EXISTS founding_member_since          TIMESTAMPTZ,  -- never changes once set
  ADD COLUMN IF NOT EXISTS founding_member_revoked        BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS founding_member_revoked_reason TEXT,
  ADD COLUMN IF NOT EXISTS founding_member_revoked_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS founding_welcome_seen          BOOLEAN     NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 2) Founding Member columns — customers (mirror perks/recognition)
-- ---------------------------------------------------------------------------
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS founding_member                BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS founding_member_id             INTEGER,
  ADD COLUMN IF NOT EXISTS founding_member_since          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS founding_member_revoked        BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS founding_member_revoked_reason TEXT,
  ADD COLUMN IF NOT EXISTS founding_member_revoked_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS founding_welcome_seen          BOOLEAN     NOT NULL DEFAULT FALSE;

-- Sequential founder numbers. Separate sequences per audience so cleaners and
-- customers each read "Founding Member #1, #2, …" from their own count.
CREATE SEQUENCE IF NOT EXISTS founding_member_cleaner_seq  START 1;
CREATE SEQUENCE IF NOT EXISTS founding_member_customer_seq START 1;

-- Founder numbers are unique within an audience (partial — ignore NULLs / non-members).
CREATE UNIQUE INDEX IF NOT EXISTS idx_cleaners_founding_id
  ON cleaners (founding_member_id) WHERE founding_member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_founding_id
  ON customers (founding_member_id) WHERE founding_member_id IS NOT NULL;
-- Search/tiebreaker + directory queries filter on active membership.
CREATE INDEX IF NOT EXISTS idx_cleaners_founding_active
  ON cleaners (founding_member) WHERE founding_member = TRUE AND founding_member_revoked = FALSE;

-- ---------------------------------------------------------------------------
-- 3) Promotions engine
-- ---------------------------------------------------------------------------
-- One promotion = one page of designed content (PowerPoint-style single slide),
-- a templated CTA, display rules, and expiry. Everything the widget needs to
-- render + behave lives on the row, so adding a promo needs zero extra config.
CREATE TABLE IF NOT EXISTS promotions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   TEXT UNIQUE NOT NULL,               -- public URL: /promo/:slug
  name                   TEXT NOT NULL,                      -- admin-facing label
  template_key           TEXT,                               -- catalog template it was built from
  audience               TEXT NOT NULL DEFAULT 'all'
                         CHECK (audience IN ('all', 'visitors', 'customers', 'cleaners')),
  status                 TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'active', 'paused', 'expired', 'archived')),

  -- Rich single-page design: ordered blocks (heading/text/image/spacer/badge…)
  -- plus canvas styling (background, theme). Rendered by the shared PromoWidget.
  design                 JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Templated CTA: { label, action: 'claim'|'link'|'dismiss', url?,
  --                  requireField?: 'email'|'phone'|'none', successMessage? }
  cta                    JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Display rules: { placement: 'modal'|'banner'|'inline', pages: [..],
  --                  delaySeconds, persist: bool, frequency: 'once'|'every_visit'|'daily',
  --                  showOnFirstVisit: bool }
  display                JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Expiry — either can fire; whichever hits first expires the promo.
  starts_at              TIMESTAMPTZ,
  expires_at             TIMESTAMPTZ,                        -- time-based expiry
  max_claims             INTEGER,                            -- claim-count expiry (NULL = unlimited)
  claim_count            INTEGER NOT NULL DEFAULT 0,
  view_count             INTEGER NOT NULL DEFAULT 0,

  -- When claimed, confer Founding Member status on the claimant.
  grants_founding_member BOOLEAN NOT NULL DEFAULT FALSE,

  created_by             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_active
  ON promotions (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_promotions_slug ON promotions (slug);

-- One row per claim. Dedupe by (promotion, email) and (promotion, user) so the
-- same person can't inflate claim_count or double-grant founding status.
CREATE TABLE IF NOT EXISTS promotion_claims (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id  UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  email         TEXT,
  phone         TEXT,
  field_value   TEXT,                                       -- raw captured CTA field
  granted_founding BOOLEAN NOT NULL DEFAULT FALSE,
  ip            TEXT,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  claimed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_claims_promo ON promotion_claims (promotion_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_claims_email
  ON promotion_claims (promotion_id, LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_claims_user
  ON promotion_claims (promotion_id, user_id) WHERE user_id IS NOT NULL;

ALTER TABLE promotions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_claims ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4) Founding Member program settings (site_settings key/value bag)
-- ---------------------------------------------------------------------------
INSERT INTO site_settings (key, value) VALUES
  ('founding.cleaner_enrollment_open',  'true'),
  ('founding.customer_enrollment_open', 'true'),
  ('founding.cleaner_cutoff_at',        ''),      -- ISO date; empty = no time cutoff
  ('founding.customer_cutoff_at',       ''),
  ('founding.cleaner_max_members',      ''),      -- integer; empty = no count cutoff
  ('founding.customer_max_members',     ''),
  ('founding.earnings_bonus_pct',       '5'),     -- cleaner lifetime payout bonus
  ('founding.since_label',              '2026')   -- "Founding Member since 2026"
ON CONFLICT (key) DO NOTHING;
