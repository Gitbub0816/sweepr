-- Day-of-service operational flow
-- Extends bookings with real-time tracking, photo evidence, GPS verification,
-- and secure access code delivery.

-- ── Status substates ─────────────────────────────────────────────────────────
-- The canonical booking status progression:
--   scheduled → en_route → arrived → in_progress → awaiting_checkout → completed
-- Legacy statuses (draft, matching, confirmed, disputed, cancelled_*) remain.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS day_status TEXT,            -- null = not yet day-of
  ADD COLUMN IF NOT EXISTS cleaner_lat NUMERIC(10,7),  -- GPS on "Start Route"
  ADD COLUMN IF NOT EXISTS cleaner_lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS arrival_verified_at TIMESTAMPTZ, -- GPS proximity confirmed
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,          -- "Start Clean" tapped
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,        -- "Finish Clean" tapped
  ADD COLUMN IF NOT EXISTS address_revealed_at TIMESTAMPTZ, -- when full address was sent
  ADD COLUMN IF NOT EXISTS access_code_revealed_at TIMESTAMPTZ; -- when access code was sent

-- ── Before/after photo evidence ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_photos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id   UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  photo_type   TEXT NOT NULL CHECK (photo_type IN ('before','after','checkout','damage')),
  storage_key  TEXT NOT NULL,  -- R2 object key (never a public URL)
  room_label   TEXT,           -- "kitchen", "bathroom_1", "bedroom_2", etc.
  uploaded_by  TEXT NOT NULL,  -- clerk_id of uploader
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_photos_booking ON booking_photos(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_photos_type    ON booking_photos(booking_id, photo_type);

-- ── Real-time location pings from cleaner ─────────────────────────────────────
-- Retained for 72 hours then purged (privacy: §3.3 handbook).
CREATE TABLE IF NOT EXISTS cleaner_location_pings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  cleaner_id  UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  lat         NUMERIC(10,7) NOT NULL,
  lng         NUMERIC(10,7) NOT NULL,
  accuracy_m  NUMERIC(6,1),
  heading     NUMERIC(5,1),
  speed_kmh   NUMERIC(5,1),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_pings_booking  ON cleaner_location_pings(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_pings_created  ON cleaner_location_pings(created_at);

-- ── Completion package ────────────────────────────────────────────────────────
-- Snapshot generated when a job completes; immutable audit record.
CREATE TABLE IF NOT EXISTS job_completion_packages (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id     UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  cleaner_id     UUID REFERENCES cleaners(id),
  customer_id    UUID REFERENCES customers(id),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  duration_mins  INT,
  before_photo_count INT DEFAULT 0,
  after_photo_count  INT DEFAULT 0,
  checkout_photo_key TEXT,      -- checkout photo storage key
  summary_json   JSONB,         -- full snapshot of job details at completion
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Secure access codes ───────────────────────────────────────────────────────
-- Stored encrypted at rest; delivered only after GPS arrival verification.
-- The cleaner app never receives these until the system confirms proximity.
CREATE TABLE IF NOT EXISTS booking_access_codes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  code_type   TEXT NOT NULL CHECK (code_type IN ('lockbox','keypad','doorcode','building','garage','other')),
  code_value  TEXT NOT NULL,  -- application-level encrypted; decrypt in API only
  notes       TEXT,
  created_by  TEXT NOT NULL,  -- clerk_id of customer who entered it
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
