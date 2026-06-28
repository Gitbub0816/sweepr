-- Migration 027: ensure the founding owner has full super_admin access.
--
-- Symptom this fixes: admin pages gated by a specific admin_role (e.g. Payouts →
-- Fee Configuration, which requires finance/ops/super_admin) return 403 even
-- though the generic admin pages load. That happens when the user is an admin
-- but their admin_role is NULL.
--
-- Idempotent: safe to run repeatedly. Also re-asserts the admin_role columns in
-- case migration 019 had not been applied on this database.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_role TEXT
    CHECK (admin_role IN ('super_admin','admin','ops','finance','trainer','support'));

UPDATE users
SET role = 'super_admin',
    admin_role = 'super_admin'
WHERE lower(email) = lower('caleb.owen2019@outlook.com');
