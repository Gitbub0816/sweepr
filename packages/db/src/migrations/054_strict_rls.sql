-- Migration 054: Strict row-level security (deny-by-default).
--
-- Architecture note: the Sweepr API (Cloudflare Worker) connects to Neon as
-- the database OWNER, which bypasses RLS (we intentionally do not FORCE RLS),
-- so nothing about the app changes. Integration partners (Stripe, Clerk,
-- Checkr, Didit, MailerSend, Slack, Mapbox, PostHog) never connect to
-- Postgres directly — they talk to the API over HTTPS — so they are
-- unaffected by design.
--
-- What changes: migration 026 enabled RLS on 7 tables but added a permissive
-- `app_full_access` policy with no TO clause, which applies to PUBLIC — i.e.
-- ANY role with a table grant could read every row. This migration:
--   1. Drops those overly-permissive policies (the owner doesn't need them).
--   2. Enables RLS on EVERY table in public, so any non-owner role
--      (read-only analytics, a leaked credential, an accidental anon grant)
--      sees zero rows unless a scoped policy is explicitly created for it.
--   3. Revokes all table/sequence privileges from PUBLIC, closing the
--      default-grant path entirely.
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    -- Remove the PUBLIC-scoped permissive policy from migration 026 if present.
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t.tablename
        AND policyname = 'app_full_access'
    ) THEN
      EXECUTE format('DROP POLICY app_full_access ON public.%I', t.tablename);
    END IF;
  END LOOP;
END $$;

-- Close the default-privilege path for any role that isn't explicitly granted.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
