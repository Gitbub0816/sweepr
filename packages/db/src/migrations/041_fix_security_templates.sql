-- Migration 041: Fix security response templates that duplicated the auto-reply.
-- The seeded security/acknowledge template had the same copy as the auto-reply
-- ("we received your report"). Updated to a meaningful follow-up message.

UPDATE response_templates
SET
  name = 'Initial update (post auto-reply)',
  body = 'Following up on your report ({{case_code}}): our team has reviewed the initial information and is now investigating. We will be in touch if we need any additional details. Please reference your Case Code in all further correspondence.',
  updated_at = NOW()
WHERE department = 'security' AND key = 'acknowledge';
