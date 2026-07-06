-- 074_cleaner_service_area_and_declines.sql
-- Cleaners can set their own service area (an address + radius), and the
-- assignment engine tracks declines so a daily free decline doesn't hurt a
-- cleaner's acceptance rate but further declines do.

-- Per-cleaner service area gets a human label + freshness timestamp. The engine
-- treats one primary area per cleaner; the API replaces it on save.
ALTER TABLE cleaner_service_areas ADD COLUMN IF NOT EXISTS label      TEXT;
ALTER TABLE cleaner_service_areas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Decline accounting on the offer queue:
--   declined_free = TRUE  -> the cleaner's one free decline for that day (no penalty)
--   declined_free = FALSE -> a penalized decline (counts against acceptance rate)
--   responded_at          -> when the cleaner accepted/declined (for the daily-free window)
ALTER TABLE assignment_queue ADD COLUMN IF NOT EXISTS declined_free BOOLEAN;
ALTER TABLE assignment_queue ADD COLUMN IF NOT EXISTS responded_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_assignment_queue_cleaner_responded
  ON assignment_queue (cleaner_id, responded_at);
