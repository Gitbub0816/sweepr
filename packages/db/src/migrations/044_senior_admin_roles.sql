-- Migration 044: S-level (senior) admin roles per department
-- Senior admins can: manage admins within their department scope, see unredacted PII relevant to their scope.

-- Extend CHECK constraint on users.admin_role to include senior variants
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_admin_role_check;
ALTER TABLE users ADD CONSTRAINT users_admin_role_check CHECK (
  admin_role IN (
    'super_admin',
    'admin',
    'ops',        'ops_senior',
    'finance',    'finance_senior',
    'trainer',    'trainer_senior',
    'support',    'support_senior',
    'it',         'it_senior',
    'security',   'security_senior'
  )
);

-- Same for admin_invites
ALTER TABLE admin_invites DROP CONSTRAINT IF EXISTS admin_invites_admin_role_check;
ALTER TABLE admin_invites ADD CONSTRAINT admin_invites_admin_role_check CHECK (
  admin_role IN (
    'super_admin',
    'admin',
    'ops',        'ops_senior',
    'finance',    'finance_senior',
    'trainer',    'trainer_senior',
    'support',    'support_senior',
    'it',         'it_senior',
    'security',   'security_senior'
  )
);
