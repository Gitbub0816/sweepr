-- Copyright © 2026–Present ClearKey Solutions, LLC. All Rights Reserved.
-- Proprietary and Confidential.

-- ============================================================================
-- Promotions engine v2: multi-page, multi-CTA, code-mode widgets + MCP
-- publish provenance.
-- ============================================================================
-- No shape change is needed on `promotions.design` / `promotions.cta` — both
-- are already JSONB (migration 085; `reward` added in 087) and happily carry
-- the new `PromoDesignV2` shape (packages/utils/src/promoSchema.ts): an
-- ordered array of PAGES, each with its own authoring mode (blocks / canvas
-- / poster / code) and its own `ctas[]` array, instead of one fixed set of
-- blocks and a single CTA. This migration is therefore additive-only:
--
--   1) `design_version` distinguishes the shape actually stored in `design`
--      (+ the legacy `cta` column) so readers never have to sniff JSON to
--      decide whether to run the legacy-upgrade normalizer. Existing rows
--      default to 1 (legacy: `{blocks, poster?, canvas?}` + one top-level
--      `cta`); the rebuilt admin designer and the MCP publish tool always
--      write 2 (`PromoDesignV2`: `{version:2, entryPageKey, pages:[...]}`).
--      `normalizeLegacyPromoDesign` / `toPromoDesignV2`
--      (packages/utils/src/promoSchema.ts) upgrade a version-1 row to the v2
--      shape IN MEMORY at read time — no backfill of existing rows is
--      required, and every promotion that already shipped keeps rendering
--      exactly as before until an admin (or the MCP) next saves it, at which
--      point it's written back as version 2.
--   2) `created_via` records provenance: 'console' (the admin designer,
--      default — matches every row that already exists) or 'mcp'. This is
--      the audit trail for the ONE deliberate exception in the whole MCP
--      worker where a connected LLM can publish a promotion directly to
--      status='active' without a human clicking anything in the admin
--      console — see apps/mcp/src/mcp/promotionTools.ts's docblock and the
--      sweepr://promotions-mcp-exception resource for the guardrails
--      (admin-authenticated, schema-validated, audited, draft-only except
--      for the one publish_promotion tool).
-- ============================================================================

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS design_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_via     TEXT     NOT NULL DEFAULT 'console';

ALTER TABLE promotions
  ADD CONSTRAINT promotions_design_version_check
    CHECK (design_version IN (1, 2));

ALTER TABLE promotions
  ADD CONSTRAINT promotions_created_via_check
    CHECK (created_via IN ('console', 'mcp'));

COMMENT ON COLUMN promotions.design_version IS
  '1 = legacy single-page {blocks,poster?,canvas?} + top-level cta column. '
  '2 = PromoDesignV2 multi-page {pages:[...]} shape stored entirely in '
  '`design`; the `cta` column is unused for version-2 rows (kept, not '
  'dropped, so no destructive migration is ever required). Upgrade path is '
  'read-time normalization (packages/utils/src/promoSchema.ts), not a '
  'backfill — see this file''s header comment.';

COMMENT ON COLUMN promotions.created_via IS
  'Provenance: ''console'' (admin designer, default) or ''mcp'' (created or '
  'last published by the MCP promotion tools). Informational only — never '
  'used for access control.';

-- Every mcp-authored promotion is trivially auditable from the admin list.
CREATE INDEX IF NOT EXISTS idx_promotions_created_via
  ON promotions (created_via) WHERE created_via = 'mcp';
