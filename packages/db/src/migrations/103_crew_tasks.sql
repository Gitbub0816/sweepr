/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- 103_crew_tasks.sql
-- Team Cleans — per-booking task decomposition + labor-balanced allocation.
--
-- Wave 1 gave a booking crew SEATS (booking_crew_assignments, mig 101). This
-- migration adds the WORK: a booking's cleaning is decomposed into discrete
-- cleaning_tasks (rooms, extras, whole-home overhead), each with an integer
-- estimated_minutes derived from the Pricing v2 quote engine's per-room labor.
-- A deterministic greedy load-balancer (lib/crew/taskAllocation.ts) then
-- assigns each task to a crew member so LABOR (minutes) is balanced across the
-- crew — not room count — with the LEAD carrying walkthrough/coordination
-- overhead and therefore a lighter cleaning load.
--
-- Gated behind the 'team_task_allocation_enabled' site_setting flag (see
-- lib/crew/crewConfig.ts isTeamFlagEnabled). Solo bookings need no tasks and
-- behave exactly as before.
--
-- NOTE (migration numbering): at authoring time the latest migration on disk
-- was 101_team_cleans.sql; a sibling agent owns 102_*.sql (not yet present).
-- This file is numbered 103 by design to sit after that sibling migration. If
-- 102 is still missing when the consolidated schema is built there will be a
-- numbering gap — that is expected and harmless (build-schema sorts + skips no
-- numbers); it does NOT create 102.

-- ─── cleaning_tasks: one row per decomposed unit of work on a booking ────────
CREATE TABLE IF NOT EXISTS cleaning_tasks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id              UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  -- Canonical Pricing v2 room type when the task is a room ('kitchen',
  -- 'bathroom', 'bedroom', 'living_room'); NULL for extras / whole-home units.
  room_type               TEXT,
  -- Human-facing label for the work unit ("Kitchen ×1", "Inside Oven", …).
  area_label              TEXT NOT NULL,
  -- The booking's cleaning level for room tasks (refresh / extra_attention /
  -- significant_attention) or the inferred condition band; NULL where N/A.
  cleaning_level          TEXT,

  task_type               TEXT NOT NULL
    CHECK (task_type IN ('room', 'extra', 'operational', 'clutter', 'size')),
  -- Person-minutes of work for this unit, derived from the v2 quote (integer).
  estimated_minutes       INT  NOT NULL,
  -- Whether this unit can be worked concurrently with others (different room /
  -- independent extra). Whole-home overhead (setup, size) is FALSE.
  parallelizable          BOOLEAN NOT NULL DEFAULT TRUE,
  -- A skill/cert a cleaner must hold to take this task (NULL = anyone).
  required_qualification  TEXT,

  -- The crew member currently responsible; NULL while unassigned / dropped.
  assigned_cleaner_id     UUID REFERENCES cleaners(id) ON DELETE SET NULL,
  status                  TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'complete')),

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_booking ON cleaning_tasks (booking_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_booking_status ON cleaning_tasks (booking_id, status);

COMMENT ON TABLE cleaning_tasks IS
  'Per-booking decomposed work units (rooms, extras, whole-home overhead) with integer person-minutes from the Pricing v2 quote. Labor-balanced across the crew by lib/crew/taskAllocation.ts. Only populated for team bookings behind the team_task_allocation_enabled flag.';

-- ─── RLS parity (owner-bypass; matches migrations 100/101) ──────────────────
ALTER TABLE cleaning_tasks ENABLE ROW LEVEL SECURITY;
