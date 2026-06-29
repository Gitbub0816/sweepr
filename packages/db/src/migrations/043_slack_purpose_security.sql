-- Migration 043: Add 'security' to slack_channels purpose check constraint.
-- Postgres doesn't allow ALTER CONSTRAINT on a CHECK — drop and re-add.

BEGIN;

ALTER TABLE slack_channels DROP CONSTRAINT IF EXISTS slack_channels_purpose_check;

ALTER TABLE slack_channels
  ADD CONSTRAINT slack_channels_purpose_check
  CHECK (purpose IN ('approvals','admin','operations','finance','it','training','security','custom'));

COMMIT;
