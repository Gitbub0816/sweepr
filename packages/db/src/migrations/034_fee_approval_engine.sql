-- Migration 034: Fee Change Approval Engine.
--
-- Versioned fee configurations plus a full proposal/approval state machine:
-- proposals, per-user actions, collaborators, notifications, and secure
-- single-use action links. Sweepr is the authoritative approval + audit system.

-- ── Versioned fee configurations ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_configurations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  fee_type           TEXT NOT NULL
    CHECK (fee_type IN ('customer_service_fee','platform_fee','cleaner_commission',
      'insurance_admin_fee','cancellation_fee','reschedule_fee','adjustment_fee',
      'marketplace_fee','payment_processing_pass_through','other')),
  affected_party     TEXT NOT NULL
    CHECK (affected_party IN ('customers','cleaners','both','internal_only')),
  calculation_method TEXT NOT NULL
    CHECK (calculation_method IN ('flat_amount','percentage','tiered_percentage',
      'dynamic_formula','market_based','city_based','service_type_based')),
  flat_amount_cents  INTEGER,
  percentage_bps     INTEGER,
  formula_json       JSONB,
  city               TEXT,
  state              TEXT,
  service_type       TEXT,
  status             TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','active','superseded','archived')),
  active_from        TIMESTAMPTZ,
  active_until       TIMESTAMPTZ,
  version            INTEGER NOT NULL DEFAULT 1,
  supersedes_id      UUID REFERENCES fee_configurations(id),
  created_by         TEXT NOT NULL,                 -- clerk id
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fee_configs_status ON fee_configurations (status);

-- ── Proposals (the state machine) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_change_proposals (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_fee_configuration_id UUID NOT NULL REFERENCES fee_configurations(id) ON DELETE CASCADE,
  proposer_clerk_id         TEXT NOT NULL,
  proposer_user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  title                     TEXT NOT NULL,
  reason                    TEXT NOT NULL,
  internal_notes            TEXT,
  external_notice_summary   TEXT,
  status                    TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft','pending','collaboration','approved','cooldown',
      'notice_scheduled','notice_sent','effective','declined','expired_declined',
      'cancelled','revoked')),
  proposed_effective_at     TIMESTAMPTZ NOT NULL,
  response_deadline_at      TIMESTAMPTZ NOT NULL,
  response_deadline_removed_at TIMESTAMPTZ,
  approved_at               TIMESTAMPTZ,
  cooldown_started_at       TIMESTAMPTZ,
  cooldown_expires_at       TIMESTAMPTZ,
  notice_sent_at            TIMESTAMPTZ,
  notice_period_ends_at     TIMESTAMPTZ,
  final_effective_at        TIMESTAMPTZ,
  declined_at               TIMESTAMPTZ,
  decline_reason            TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fee_proposals_status ON fee_change_proposals (status);

-- ── Per-user actions (history) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_change_proposal_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  UUID NOT NULL REFERENCES fee_change_proposals(id) ON DELETE CASCADE,
  actor_clerk_id TEXT NOT NULL,
  actor_email  TEXT,
  action       TEXT NOT NULL
    CHECK (action IN ('created','approved','declined','ignored','proposed_modification',
      'joined_collaboration','revoked_approval','modified','cooldown_started',
      'cooldown_reset','notice_sent','became_effective','expired_declined','cancelled')),
  comment      TEXT,
  proposed_modification_json JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fee_actions_proposal ON fee_change_proposal_actions (proposal_id);

-- ── Collaborators (required final approvers) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_change_collaborators (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       UUID NOT NULL REFERENCES fee_change_proposals(id) ON DELETE CASCADE,
  clerk_id          TEXT NOT NULL,
  email             TEXT,
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  must_approve_final BOOLEAN NOT NULL DEFAULT TRUE,
  approved_final_at TIMESTAMPTZ,
  UNIQUE (proposal_id, clerk_id)
);

-- ── Notifications sent for a proposal ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_change_notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  UUID NOT NULL REFERENCES fee_change_proposals(id) ON DELETE CASCADE,
  clerk_id     TEXT,
  channel      TEXT NOT NULL CHECK (channel IN ('in_app','email','slack','push','sms')),
  recipient    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed')),
  sent_at      TIMESTAMPTZ,
  provider_message_id TEXT,
  error_message TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fee_notifications_proposal ON fee_change_notifications (proposal_id);

-- ── Secure single-use action links (email fallback) ──────────────────────────
CREATE TABLE IF NOT EXISTS fee_change_action_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES fee_change_proposals(id) ON DELETE CASCADE,
  clerk_id    TEXT NOT NULL,
  email       TEXT,
  token_hash  TEXT NOT NULL,               -- sha256 of the raw token; raw never stored
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fee_action_links_token ON fee_change_action_links (token_hash);
