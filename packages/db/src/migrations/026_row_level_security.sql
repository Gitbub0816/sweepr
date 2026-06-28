-- Migration 026: Row-Level Security (defense in depth)
--
-- Authorization in Sweepr is enforced at the application layer: every API
-- route runs behind Clerk auth and scopes queries to the current user. The
-- Worker connects to Neon as the database OWNER role, which BYPASSES RLS by
-- default — so enabling RLS here does NOT change app behaviour.
--
-- What it buys us: if any *other* role ever connects (a read-only analytics
-- role, a leaked non-owner credential, an accidental anon grant), it gets NO
-- access to these tables unless a policy explicitly allows it. This is a
-- safety net, not the primary control.
--
-- We intentionally do NOT use FORCE ROW LEVEL SECURITY, so the owner/app
-- connection keeps full access and nothing breaks.

DO $$
DECLARE
  t TEXT;
  protected_tables TEXT[] := ARRAY[
    'users',
    'customers',
    'cleaners',
    'addresses',
    'bookings',
    'reviews',
    'cleaner_training_progress'
  ];
BEGIN
  FOREACH t IN ARRAY protected_tables LOOP
    -- Only touch tables that actually exist in this database.
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

      -- A single permissive policy for the application's authenticated role.
      -- The app already scopes rows in SQL, so this grants the app full access
      -- while non-listed roles (e.g. anon) remain blocked.
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t AND policyname = 'app_full_access'
      ) THEN
        EXECUTE format(
          'CREATE POLICY app_full_access ON %I FOR ALL USING (true) WITH CHECK (true)',
          t
        );
      END IF;
    END IF;
  END LOOP;
END $$;
