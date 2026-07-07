-- Migration 077: Background Check Adjudication cases.
--
-- One case per background-check evaluation of a cleaner applicant. Trust &
-- Safety enters (or a provider integration supplies) the applicant's
-- convictions/pending charges; the deterministic policy engine
-- (apps/api/src/lib/adjudicationPolicy.ts) produces auto_approve / auto_deny /
-- executive_review / hold, and Executive Review cases are decided manually in
-- the admin Trust & Safety → Adjudication queue.
--
-- The applicant's policy acknowledgment (required before starting the
-- background check) is recorded in the existing legal_acceptances table with
-- document_slug = 'background-check-adjudication'.

CREATE TABLE IF NOT EXISTS adjudication_cases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id       UUID REFERENCES cleaners(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  -- needs_input → evaluated (auto_approve/auto_deny) or executive_review/hold → decided
  status           TEXT NOT NULL DEFAULT 'needs_input',
  -- engine output
  decision         TEXT,                    -- auto_approve | auto_deny | executive_review | hold
  reasons          JSONB NOT NULL DEFAULT '[]'::jsonb,
  rules            JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- structured inputs the engine evaluated (audit trail)
  convictions      JSONB NOT NULL DEFAULT '[]'::jsonb,
  pending_charges  JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- final human outcome for executive_review/hold cases
  final_outcome    TEXT,                    -- approved | denied
  final_note       TEXT,
  decided_by       TEXT,                    -- admin clerk_id
  decided_at       TIMESTAMPTZ,
  provider         TEXT NOT NULL DEFAULT 'manual',  -- manual | checkr | <future provider>
  provider_report_id TEXT,
  created_by       TEXT,                    -- admin clerk_id who opened/entered the case
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adjudication_cases_status ON adjudication_cases (status);
CREATE INDEX IF NOT EXISTS idx_adjudication_cases_cleaner ON adjudication_cases (cleaner_id);

ALTER TABLE adjudication_cases ENABLE ROW LEVEL SECURITY;
