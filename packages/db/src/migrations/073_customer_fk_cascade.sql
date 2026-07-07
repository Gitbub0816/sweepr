/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- 073_customer_fk_cascade.sql
-- Companion to 072 for the customer side. Tables added after migration 031
-- ("cascade-deletability") never got ON DELETE CASCADE on their customers(id)
-- FK, so a customer hard-delete (GDPR) failed with a foreign-key violation
-- (first observed: job_completion_packages_customer_id_fkey). These rows are
-- the customer's own service/financial history and are already removable via
-- their booking's cascade, so CASCADE here is consistent.
--
-- Drops any existing FK on the column by real name first, so name drift or a
-- prior definition can't leave a non-cascading constraint in place.

DO $$
DECLARE
  target RECORD;
  conname TEXT;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('job_completion_packages', 'customer_id'),
      ('reviews',                 'customer_id'),
      ('payments',                'customer_id')
    ) AS t(tbl, col)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = target.tbl AND column_name = target.col
    ) THEN
      CONTINUE;
    END IF;

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
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES customers(id) ON DELETE CASCADE',
      target.tbl, target.tbl || '_' || target.col || '_fkey', target.col
    );
  END LOOP;
END $$;
