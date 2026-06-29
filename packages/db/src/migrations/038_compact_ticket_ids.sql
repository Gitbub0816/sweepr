-- Migration 038: compact ticket identifiers for security + IT tickets.
--
-- Two identifiers per ticket:
--   • case_code  — public-facing Case Code (PREFIX_HEX5), shown to users.
--   • ticket_id  — internal canonical Ticket ID (PREFIX_DATE:TIME.TYPE_HEX).
-- Plus decoded parts for sorting/search. Legacy ticket_number kept for back-compat.

ALTER TABLE security_tickets
  ADD COLUMN IF NOT EXISTS ticket_id      TEXT,
  ADD COLUMN IF NOT EXISTS case_code      TEXT,
  ADD COLUMN IF NOT EXISTS ticket_prefix  TEXT,
  ADD COLUMN IF NOT EXISTS encoded_date   TEXT,
  ADD COLUMN IF NOT EXISTS encoded_time   TEXT,
  ADD COLUMN IF NOT EXISTS issue_type     TEXT,
  ADD COLUMN IF NOT EXISTS hex_suffix     TEXT;
CREATE INDEX IF NOT EXISTS idx_security_tickets_case ON security_tickets (case_code);
CREATE INDEX IF NOT EXISTS idx_security_tickets_ticketid ON security_tickets (ticket_id);

ALTER TABLE it_tickets
  ADD COLUMN IF NOT EXISTS ticket_id      TEXT,
  ADD COLUMN IF NOT EXISTS case_code      TEXT,
  ADD COLUMN IF NOT EXISTS ticket_prefix  TEXT,
  ADD COLUMN IF NOT EXISTS encoded_date   TEXT,
  ADD COLUMN IF NOT EXISTS encoded_time   TEXT,
  ADD COLUMN IF NOT EXISTS issue_type     TEXT,
  ADD COLUMN IF NOT EXISTS hex_suffix     TEXT;
CREATE INDEX IF NOT EXISTS idx_it_tickets_case ON it_tickets (case_code);
CREATE INDEX IF NOT EXISTS idx_it_tickets_ticketid ON it_tickets (ticket_id);
