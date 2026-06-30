-- Migration 049: Reset bootstrap super-admin invite so it can be re-used
-- The token was consumed during an earlier failed sign-up (Clerk CAPTCHA bug)
-- but no Clerk account was created. Reset used_at so the invite can be accepted.
UPDATE admin_invites
SET used_at = NULL,
    expires_at = NOW() + INTERVAL '10 years'
WHERE token = 'sweepr-owner-bootstrap-caleb-super-admin';
