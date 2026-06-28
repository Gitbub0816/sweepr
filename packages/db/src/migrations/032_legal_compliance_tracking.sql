-- Migration 032: legal compliance tracking.
--
-- Backend support for the legal-document audit: versioned legal documents,
-- per-user acceptance records, SMS/background-check/tax consents, privacy
-- requests, damage/incident claims, and cookie consents. All idempotent.

-- ── Legal documents (versioned registry) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS legal_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT NOT NULL,
  title          TEXT NOT NULL,
  version        TEXT NOT NULL DEFAULT '1.0',
  effective_date DATE,
  last_updated   DATE,
  hash           TEXT,                       -- content hash of the published doc
  html_url       TEXT,
  pdf_url        TEXT,
  status         TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','superseded','archived')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slug, version)
);
CREATE INDEX IF NOT EXISTS idx_legal_documents_slug ON legal_documents (slug);

-- ── Legal acceptances (immutable consent records) ────────────────────────────
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID REFERENCES users(id) ON DELETE CASCADE,
  document_slug          TEXT NOT NULL,
  document_version       TEXT NOT NULL,
  document_hash          TEXT,
  accepted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address             TEXT,
  user_agent             TEXT,
  flow_context           TEXT,               -- e.g. customer_signup, checkout, cleaner_signup
  checkbox_label_snapshot TEXT
);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user ON legal_acceptances (user_id);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_doc ON legal_acceptances (document_slug);

-- ── SMS consents (transactional vs marketing) ────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_consents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  phone_number        TEXT NOT NULL,
  consent_type        TEXT NOT NULL DEFAULT 'transactional'
    CHECK (consent_type IN ('transactional','marketing')),
  opt_in_at           TIMESTAMPTZ,
  opt_in_source       TEXT,
  checkbox_text_snapshot TEXT,
  opt_out_at          TIMESTAMPTZ,
  opt_out_source      TEXT,
  last_stop_message_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_consents_user ON sms_consents (user_id);

-- ── Background check consents (FCRA) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS background_check_consents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id            UUID REFERENCES cleaners(id) ON DELETE CASCADE,
  disclosure_version    TEXT,
  authorization_version TEXT,
  authorized_at         TIMESTAMPTZ,
  ip_address            TEXT,
  vendor                TEXT,
  report_status         TEXT,
  pre_adverse_action_at TIMESTAMPTZ,
  adverse_action_at     TIMESTAMPTZ,
  dispute_deadline      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bg_consents_cleaner ON background_check_consents (cleaner_id);

-- ── Tax profiles ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_profiles (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id               UUID REFERENCES cleaners(id) ON DELETE CASCADE,
  legal_name               TEXT,
  business_name            TEXT,
  tin_status               TEXT DEFAULT 'not_collected',
  w9_collected_at          TIMESTAMPTZ,
  backup_withholding_status TEXT DEFAULT 'none',
  tax_form_delivery_consent BOOLEAN NOT NULL DEFAULT FALSE,
  tax_year                 INT,
  form_type                TEXT,             -- 1099-NEC | 1099-K | 1099-MISC
  form_status              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tax_profiles_cleaner ON tax_profiles (cleaner_id);

-- ── Privacy requests (CCPA/GDPR DSARs) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS privacy_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  request_type  TEXT NOT NULL
    CHECK (request_type IN ('know','access','delete','correct','opt_out','portability')),
  jurisdiction  TEXT,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at   TIMESTAMPTZ,
  due_at        TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','verifying','in_progress','completed','denied')),
  response_at   TIMESTAMPTZ,
  denial_reason TEXT,
  appeal_status TEXT
);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_requester ON privacy_requests (requester_id);

-- ── Damage claims ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS damage_claims (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id       UUID REFERENCES customers(id) ON DELETE SET NULL,
  cleaner_id        UUID REFERENCES cleaners(id) ON DELETE SET NULL,
  reported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_status   TEXT,                    -- on_time | late
  description       TEXT,
  evidence_urls     JSONB NOT NULL DEFAULT '[]',
  cleaner_statement TEXT,
  decision          TEXT,                    -- repair | replace | credit | insurance | denied | pending
  payout_amount     INT,                     -- cents
  insurance_claim_id TEXT,
  status            TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','investigating','resolved','denied')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_damage_claims_booking ON damage_claims (booking_id);

-- ── Incident reports (trust & safety) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incident_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            UUID REFERENCES bookings(id) ON DELETE SET NULL,
  reporter_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  type                  TEXT,
  severity              TEXT,
  description           TEXT,
  evidence_urls         JSONB NOT NULL DEFAULT '[]',
  police_report_required BOOLEAN NOT NULL DEFAULT FALSE,
  safety_action_taken   TEXT,
  status                TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','investigating','resolved','closed')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incident_reports_booking ON incident_reports (booking_id);

-- ── Cookie consents ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cookie_consents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  anonymous_id TEXT,
  necessary    BOOLEAN NOT NULL DEFAULT TRUE,
  functional   BOOLEAN NOT NULL DEFAULT FALSE,
  analytics    BOOLEAN NOT NULL DEFAULT FALSE,
  marketing    BOOLEAN NOT NULL DEFAULT FALSE,
  gpc_detected BOOLEAN NOT NULL DEFAULT FALSE,
  consent_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cookie_consents_user ON cookie_consents (user_id);
CREATE INDEX IF NOT EXISTS idx_cookie_consents_anon ON cookie_consents (anonymous_id);
