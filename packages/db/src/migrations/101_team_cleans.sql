/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- 101_team_cleans.sql
-- Team Cleans (multi-cleaner crews) — foundational schema.
--
-- A booking is no longer 1:1 with a cleaner. It has zero-or-more crew SEATS
-- (booking_crew_assignments): exactly one LEAD (seat_index 0) plus N MEMBER
-- seats. Solo bookings are the degenerate crew of one LEAD.
--
-- BACKWARD COMPATIBILITY (see docs/team-cleans-audit.md §13):
--   * bookings.cleaner_id is RETAINED as a compatibility pointer to the LEAD.
--     Every existing single-cleaner consumer keeps working unchanged.
--   * Every existing booking with a cleaner is backfilled as one LEAD seat.
--   * crew_status stays NULL on solo/legacy bookings, so nothing behaves
--     differently until the TEAM_CLEANS_ENABLED flag drives real crews.
-- The whole feature ships behind that flag (site_settings), default OFF.

-- ─── booking_crew_assignments: one row per crew seat ────────────────────────
CREATE TABLE IF NOT EXISTS booking_crew_assignments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  -- NULL while a seat is an open CANDIDATE (being staffed).
  cleaner_id                UUID REFERENCES cleaners(id),
  role                      TEXT NOT NULL CHECK (role IN ('LEAD', 'MEMBER')),
  -- 0 = LEAD, 1..N-1 = members. Stable seat identity for the booking.
  seat_index                INT  NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'CANDIDATE'
    CHECK (status IN ('CANDIDATE', 'INVITED', 'ACCEPTED', 'DECLINED', 'EXPIRED',
                      'CANCELLED', 'REMOVED', 'NO_SHOW', 'COMPLETED')),

  -- This seat's share of the booking's expected labor (person-minutes).
  person_minutes            INT,
  assignment_score          DECIMAL(6, 2),
  score_breakdown           JSONB,
  -- Computed at payout from the cleaner payout pool × this seat's role share.
  earnings_cents            INT NOT NULL DEFAULT 0,

  offered_at                TIMESTAMPTZ,
  expires_at                TIMESTAMPTZ,
  responded_at              TIMESTAMPTZ,
  -- Mirrors the assignment_queue "free decline" mechanic.
  declined_free             BOOLEAN NOT NULL DEFAULT FALSE,

  check_in_at               TIMESTAMPTZ,
  check_out_at              TIMESTAMPTZ,
  -- A MEMBER who cannot GPS-verify may be vouched in on-site by an already
  -- arrived crew member via a short-lived PIN. Points at that voucher's seat.
  vouched_by_assignment_id  UUID REFERENCES booking_crew_assignments(id) ON DELETE SET NULL,

  -- Per-member Stripe transfer (the booking-level payouts row stays the pool).
  stripe_transfer_id        TEXT,
  -- Optimistic-concurrency / re-staffing generation for this seat.
  crew_assignment_version   INT NOT NULL DEFAULT 1,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (booking_id, seat_index)
);

-- A person holds at most one seat per booking (partial: open seats are NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_bca_booking_cleaner_unique
  ON booking_crew_assignments (booking_id, cleaner_id)
  WHERE cleaner_id IS NOT NULL;
-- At most one LEAD seat per booking.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bca_one_lead_per_booking
  ON booking_crew_assignments (booking_id)
  WHERE role = 'LEAD';

CREATE INDEX IF NOT EXISTS idx_bca_booking_status ON booking_crew_assignments (booking_id, status);
CREATE INDEX IF NOT EXISTS idx_bca_cleaner_status ON booking_crew_assignments (cleaner_id, status)
  WHERE cleaner_id IS NOT NULL;

COMMENT ON TABLE booking_crew_assignments IS
  'One row per crew seat on a booking (LEAD seat_index 0 + N MEMBER seats). Source of truth for who is assigned; bookings.cleaner_id mirrors the LEAD for backward compatibility.';

-- ─── Booking-level crew fields ──────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS required_crew_size      INT,
  ADD COLUMN IF NOT EXISTS min_crew_size           INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS target_crew_size        INT,
  -- NULL = solo/legacy (behaves exactly as before). Orthogonal to bookings.status,
  -- like day_status — no change to the booking status machine.
  ADD COLUMN IF NOT EXISTS crew_status             TEXT
    CHECK (crew_status IS NULL OR crew_status IN
      ('NEEDS_STAFFING', 'STAFFING', 'PARTIALLY_STAFFED', 'CONFIRMED',
       'AT_RISK', 'IN_PROGRESS', 'COMPLETED', 'STAFFING_FAILED')),
  ADD COLUMN IF NOT EXISTS crew_assignment_version INT NOT NULL DEFAULT 1,
  -- The customer-elected "add one extra cleaner" upsell (flat fee, priced in
  -- Pricing v2). Distinct from Sweepr's internal capacity-driven crew sizing.
  ADD COLUMN IF NOT EXISTS extra_cleaner_requested BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN bookings.cleaner_id IS
  'The LEAD cleaner (compatibility pointer). Authoritative crew membership lives in booking_crew_assignments.';
COMMENT ON COLUMN bookings.crew_status IS
  'Crew staffing state, orthogonal to status (like day_status). NULL = solo/legacy booking.';

-- ─── cleaner_relationships: mutual preferred teammate ───────────────────────
CREATE TABLE IF NOT EXISTS cleaner_relationships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id        UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  other_cleaner_id  UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  relationship      TEXT NOT NULL DEFAULT 'PREFERRED_TEAMMATE'
    CHECK (relationship IN ('PREFERRED_TEAMMATE', 'BLOCKED')),
  -- A request is PENDING until the other cleaner accepts (mutual by acceptance).
  status            TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cleaner_id <> other_cleaner_id),
  UNIQUE (cleaner_id, other_cleaner_id)
);
CREATE INDEX IF NOT EXISTS idx_cleaner_rel_other ON cleaner_relationships (other_cleaner_id, status);

COMMENT ON TABLE cleaner_relationships IS
  'Directed cleaner-to-cleaner preferences. A PREFERRED_TEAMMATE bond is mutual only when an ACCEPTED row exists in both directions; a bonus in crew matching, never an override of eligibility.';

-- ─── crew_peer_ratings: thumbs up/down, only a pair''s FIRST shared booking ──
CREATE TABLE IF NOT EXISTS crew_peer_ratings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  rater_cleaner_id  UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  ratee_cleaner_id  UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  thumbs            TEXT NOT NULL CHECK (thumbs IN ('up', 'down')),
  comment           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (rater_cleaner_id <> ratee_cleaner_id),
  -- One rating per ordered pair, ever → prompt/collect ONLY on their first
  -- shared booking (never asked again once they have worked together).
  UNIQUE (rater_cleaner_id, ratee_cleaner_id)
);
CREATE INDEX IF NOT EXISTS idx_crew_peer_ratings_ratee ON crew_peer_ratings (ratee_cleaner_id);

COMMENT ON TABLE crew_peer_ratings IS
  'Cleaner-to-cleaner "would I work with them again" thumbs up/down, collected only on a pair''s first shared booking. Distinct from customer reviews.';

-- ─── Backfill: every existing booking with a cleaner becomes one LEAD seat ──
-- COMPLETED bookings get a COMPLETED seat; everything else an ACCEPTED seat.
-- earnings mirror the booking''s cleaner_payout pool; crew_status stays NULL so
-- these bookings keep behaving as solo/legacy.
INSERT INTO booking_crew_assignments
  (booking_id, cleaner_id, role, seat_index, status, earnings_cents,
   check_in_at, check_out_at, created_at, updated_at)
SELECT
  b.id,
  b.cleaner_id,
  'LEAD',
  0,
  CASE WHEN b.status = 'completed' THEN 'COMPLETED' ELSE 'ACCEPTED' END,
  COALESCE(b.cleaner_payout, 0),
  b.started_at,
  b.completed_at,
  NOW(),
  NOW()
FROM bookings b
WHERE b.cleaner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM booking_crew_assignments x WHERE x.booking_id = b.id
  );

-- ─── RLS parity (owner-bypass; matches migrations 089/100) ──────────────────
ALTER TABLE booking_crew_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaner_relationships    ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_peer_ratings        ENABLE ROW LEVEL SECURITY;
