-- Migration 068: backfill legacy weekly hours into the unified store.
--
-- Before unification, the Schedule page saved weekly hours as
-- cleaner_schedule rows (slot_type='recurring'). The unified read model keeps
-- weekly hours in cleaner_availability, so legacy recurring rows became
-- invisible (availability showed 0 for cleaners who set hours pre-migration).
-- Copy them over (merging overlapping windows per day) and deactivate the
-- legacy rows so nothing double-counts.
INSERT INTO cleaner_availability (cleaner_id, day_of_week, start_time, end_time, active)
SELECT cs.cleaner_id, cs.day_of_week, MIN(cs.start_time), MAX(cs.end_time), TRUE
FROM cleaner_schedule cs
WHERE cs.slot_type = 'recurring'
  AND cs.is_active = TRUE
  AND cs.day_of_week IS NOT NULL
  AND cs.start_time IS NOT NULL
  AND cs.end_time IS NOT NULL
GROUP BY cs.cleaner_id, cs.day_of_week
ON CONFLICT (cleaner_id, day_of_week) DO UPDATE
  SET start_time = LEAST(cleaner_availability.start_time, EXCLUDED.start_time),
      end_time   = GREATEST(cleaner_availability.end_time, EXCLUDED.end_time),
      active     = TRUE,
      updated_at = NOW();

UPDATE cleaner_schedule SET is_active = FALSE WHERE slot_type = 'recurring';
