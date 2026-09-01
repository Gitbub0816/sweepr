-- Copyright © 2026–Present ClearKey Solutions, LLC.
-- Proprietary & Confidential. Internal Use Only.
--
-- 105_user_reports.sql
-- Formal user-reporting and investigation system (Trust & Safety).
--
-- Customers and cleaners can formally report the OTHER PARTY on a booking they
-- share (booking-scoped by design: the reporter must be the booking's customer
-- or its assigned cleaner, and the reported user is the counterpart). Reports
-- carry photo evidence stored in the PRIVATE `sweepr-report-objects` R2 bucket
-- (never public; uploads and reads stream through the API, retrieval is
-- admin-only) and are investigated by admins in the /reports console.
--
-- Lifecycle: submitted → under_review → action_taken | dismissed
-- (dismissed may be reopened to under_review; action_taken is terminal).
-- Transitions are enforced app-side in apps/api/src/lib/userReports.ts.

-- ── Reports ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_reports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  -- Canonical users rows for both parties. Denormalized from the booking at
  -- submission time so the report stays intact even if the booking's
  -- assignment later changes.
  reporter_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reporter_role      TEXT NOT NULL CHECK (reporter_role IN ('customer', 'cleaner')),
  category           TEXT NOT NULL CHECK (category IN (
    'safety_concern', 'property_damage', 'theft', 'harassment',
    'no_show', 'unprofessional_conduct', 'payment_dispute', 'other'
  )),
  description        TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted', 'under_review', 'action_taken', 'dismissed'
  )),
  -- Resolution fields, set together when an admin closes the investigation.
  resolution_action  TEXT CHECK (resolution_action IS NULL OR resolution_action IN (
    'none', 'warning_issued', 'suspension', 'other'
  )),
  resolution_note    TEXT,
  -- Clerk id of the deciding admin (matches the admin_audit_log actor format).
  resolved_by        TEXT,
  resolved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_reports_booking  ON user_reports (booking_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON user_reports (reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON user_reports (reported_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_status   ON user_reports (status);
CREATE INDEX IF NOT EXISTS idx_user_reports_created  ON user_reports (created_at DESC);

-- One OPEN report per (booking, reporter) — the duplicate-spam guard. The API
-- pre-checks for a friendly 409, but this index is the race-safe arbiter.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_reports_open
  ON user_reports (booking_id, reporter_user_id)
  WHERE status IN ('submitted', 'under_review');

COMMENT ON TABLE user_reports IS
  'Formal booking-scoped reports a customer/cleaner files against the counterpart on their booking. Investigated by admins; lifecycle submitted → under_review → action_taken | dismissed.';

-- ── Photo evidence (private bucket: sweepr-report-objects) ───────────────────
CREATE TABLE IF NOT EXISTS user_report_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     UUID NOT NULL REFERENCES user_reports(id) ON DELETE CASCADE,
  -- Object key inside the sweepr-report-objects bucket (reports/{reportId}/…).
  storage_key   TEXT NOT NULL UNIQUE,
  content_type  TEXT NOT NULL,
  size_bytes    INT  NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_report_photos_report ON user_report_photos (report_id);

COMMENT ON TABLE user_report_photos IS
  'Photo evidence attached to a user report. Objects live in the PRIVATE sweepr-report-objects R2 bucket; retrieval streams through the API behind requireAdmin.';

-- ── Investigation notes (admin trail) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_report_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID NOT NULL REFERENCES user_reports(id) ON DELETE CASCADE,
  -- Clerk id of the admin who wrote the note ('system' rows record automatic
  -- lifecycle events like status transitions for the investigation timeline).
  admin_clerk_id  TEXT NOT NULL,
  note            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_report_notes_report ON user_report_notes (report_id);

COMMENT ON TABLE user_report_notes IS
  'Admin investigation trail for a user report. Never exposed to the reporter or the reported party.';

-- ── RLS parity (owner-bypass; matches migrations 089/100/101/104) ────────────
ALTER TABLE user_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_report_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_report_notes  ENABLE ROW LEVEL SECURITY;
