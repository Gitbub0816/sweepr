/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- 072_assignment_queue_cleaner_cascade.sql
-- Several FKs reference cleaners(id) with no ON DELETE action, so a cleaner
-- hard-delete (GDPR account deletion) failed with a foreign-key violation for
-- any cleaner who had ever been offered/assigned a job. Migration 031
-- ("cascade-deletability") set this up for customers/bookings but missed the
-- cleaner side. Complete it here.
--
-- Policy:
--   CASCADE  — pure operational transients meaningless without the cleaner.
--   SET NULL — records that must survive for history / financial / review
--              integrity, with the cleaner link removed (anonymized).
--
-- Drops any existing FK on the column by looking up its real (possibly
-- auto-generated) name first, so re-running or name drift can't leave the old
-- blocking constraint in place.

DO $$
DECLARE
  target RECORD;
  conname TEXT;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('assignment_queue',        'cleaner_id',           'CASCADE'),
      ('job_offers',              'cleaner_id',           'CASCADE'),
      ('bookings',                'cleaner_id',           'SET NULL'),
      ('reviews',                 'cleaner_id',           'SET NULL'),
      ('payouts',                 'cleaner_id',           'SET NULL'),
      ('subscriptions',           'preferred_cleaner_id', 'SET NULL'),
      ('job_completion_packages', 'cleaner_id',           'SET NULL'),
      ('payout_ledger',           'cleaner_id',           'SET NULL')
    ) AS t(tbl, col, action)
  LOOP
    -- Skip tables/columns that don't exist in this database.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = target.tbl AND column_name = target.col
    ) THEN
      CONTINUE;
    END IF;

    -- Drop every existing foreign key on (tbl, col) that targets cleaners.
    FOR conname IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
      WHERE con.contype = 'f'
        AND ns.nspname = 'public'
        AND rel.relname = target.tbl
        AND att.attname = target.col
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', target.tbl, conname);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES cleaners(id) ON DELETE %s',
      target.tbl, target.tbl || '_' || target.col || '_fkey', target.col, target.action
    );
  END LOOP;
END $$;
