-- Migration 047: Seed super_admin invite for initial owner
INSERT INTO admin_invites (token, email, created_by, admin_role, expires_at)
VALUES (
  'sweepr-owner-bootstrap-caleb-super-admin',
  'caleb.owen2019@outlook.com',
  'system_seed',
  'super_admin',
  NOW() + INTERVAL '10 years'
)
ON CONFLICT DO NOTHING;
