-- Copyright © 2026–Present ClearKey Solutions, LLC.
-- All Rights Reserved.
--
-- Proprietary and Confidential.
--
-- Unauthorized copying, modification, disclosure,
-- distribution, reverse engineering, or use is prohibited.

-- Versioned archive of legal.getsweepr.com documents, stored as static
-- snapshots (document.html, document.pdf, metadata.json) in the sweepr-legal
-- R2 bucket under legal/<slug>/v<version>/ — separate from the general
-- objects/photos bucket. This row tracks which version is "current" per
-- slug and who published it; the live legal app keeps rendering from React
-- as today, this table is the archival/audit trail alongside it.
CREATE TABLE IF NOT EXISTS legal_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  r2_prefix TEXT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  published_by_clerk_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slug, version)
);

CREATE INDEX IF NOT EXISTS idx_legal_document_versions_slug_current
  ON legal_document_versions (slug, is_current);
