-- Copyright © 2026–Present ClearKey Solutions, LLC.
-- All Rights Reserved.
--
-- Proprietary and Confidential.
--
-- Unauthorized copying, modification, disclosure,
-- distribution, reverse engineering, or use is prohibited.

-- External reviewing attorney(s): a small, isolated identity (NOT a staff
-- admin, NOT a customer/cleaner user) who can sign in via a signed magic
-- link to view, edit, and approve archived legal documents. Kept separate
-- from the staff admin Clerk app on purpose — this is one outside counsel,
-- not a platform operator.
CREATE TABLE IF NOT EXISTS legal_attorneys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  bar_number TEXT,
  bar_state TEXT,
  firm_name TEXT,
  title TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Single-use, expiring sign-in tokens (convention 8: sha256 token_hash +
-- expires_at + used_at IS NULL). The plaintext token only ever lives in the
-- magic link emailed to the attorney.
CREATE TABLE IF NOT EXISTS legal_attorney_login_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attorney_id UUID NOT NULL REFERENCES legal_attorneys(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_attorney_login_tokens_hash
  ON legal_attorney_login_tokens (token_hash);

-- Attorney review/approval state stamped onto an archived document version.
ALTER TABLE legal_document_versions
  ADD COLUMN IF NOT EXISTS attorney_approved_by UUID REFERENCES legal_attorneys(id),
  ADD COLUMN IF NOT EXISTS attorney_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attorney_name TEXT,
  ADD COLUMN IF NOT EXISTS attorney_bar_number TEXT,
  ADD COLUMN IF NOT EXISTS edited_html_at TIMESTAMPTZ;
