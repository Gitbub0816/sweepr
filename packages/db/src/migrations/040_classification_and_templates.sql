-- Migration 040: classification inference metadata + editable response templates.

-- Inference output stored on each ticket.
ALTER TABLE security_tickets
  ADD COLUMN IF NOT EXISTS classification_confidence INTEGER,
  ADD COLUMN IF NOT EXISTS classification_signals JSONB,
  ADD COLUMN IF NOT EXISTS auto_classified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE it_tickets
  ADD COLUMN IF NOT EXISTS classification_confidence INTEGER,
  ADD COLUMN IF NOT EXISTS classification_signals JSONB,
  ADD COLUMN IF NOT EXISTS auto_classified BOOLEAN NOT NULL DEFAULT FALSE;

-- Editable canned response templates (used to pre-fill manual replies).
CREATE TABLE IF NOT EXISTS response_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department   TEXT NOT NULL CHECK (department IN ('it','security')),
  key          TEXT NOT NULL,
  name         TEXT NOT NULL,
  classification TEXT,            -- optional: suggest for a specific issue type
  subject      TEXT,
  body         TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department, key)
);
CREATE INDEX IF NOT EXISTS idx_response_templates_dept ON response_templates (department);

-- Seed defaults (idempotent).
INSERT INTO response_templates (department, key, name, body) VALUES
  ('it', 'acknowledge', 'Acknowledgement',
   'Thanks for contacting Sweepr IT. We''ve received your request and a technician is reviewing it now. We''ll follow up shortly with an update or next steps.'),
  ('it', 'info_request', 'Request more information',
   'To help us investigate, could you please reply with:\n\n• When the issue started\n• The exact error message or screenshot\n• The device, browser, and app you were using\n• Steps that reproduce the problem\n\nThis will help us resolve it faster.'),
  ('it', 'in_progress', 'Work in progress',
   'A quick update: our team is actively working on your request. We''ll let you know as soon as there''s a resolution.'),
  ('it', 'resolved', 'Resolved',
   'Good news — we''ve resolved the issue you reported. Please try again and let us know if anything still looks off. We''re happy to reopen the ticket if needed.'),
  ('it', 'closed', 'Closing for inactivity',
   'We haven''t heard back, so we''re closing this request for now. Just reply to this email and reference your Case Code to reopen it anytime.'),
  ('security', 'acknowledge', 'Acknowledgement',
   'Thank you for your report. Sweepr Security has received it and our team is reviewing the information you provided. We take all reports seriously. Please reference your Case Code in any further correspondence.'),
  ('security', 'info_request', 'Request more information',
   'To assist our review, could you provide any additional detail you can safely share — such as timestamps, affected accounts or URLs, and how you encountered this? Please do not include passwords or other secrets in your reply.'),
  ('security', 'investigating', 'Investigating',
   'An update on your report: our team is actively investigating. We may follow up with additional questions. We appreciate your patience and your help keeping Sweepr safe.'),
  ('security', 'resolved', 'Resolved',
   'We''ve completed our review of your report and taken appropriate action where warranted. Thank you again for reaching out. If you have further concerns, reply and reference your Case Code.'),
  ('security', 'disclosure_ack', 'Responsible disclosure acknowledgement',
   'Thank you for practicing responsible disclosure. We''ve received your submission and our security team is reviewing it. We''ll be in touch regarding next steps.')
ON CONFLICT (department, key) DO NOTHING;
