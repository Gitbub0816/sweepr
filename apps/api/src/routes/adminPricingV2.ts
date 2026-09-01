/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Admin Pricing Studio API (Pricing v2). Mounted at /admin/pricing-v2.
 *
 * Lifecycle: draft → (validate) → active | scheduled → superseded/archived.
 * Published versions are IMMUTABLE — every mutation endpoint refuses
 * non-draft versions; editing an active version means cloning it into a new
 * draft. Rollback = clone an older version, validate, publish. All state
 * changes land in the append-only pricing_audit_events trail.
 *
 * Reads: any admin. Mutations: finance (or super_admin/owner) — the same
 * role that owns the legacy pricing surfaces.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import { requireAdmin, requireAdminRole } from "../middleware/adminRoles";
import {
  buildColdStartConfig,
  computeQuoteV2,
  diffWarnings,
  QuoteInputError,
  REFERENCE_SCENARIOS,
  validatePricingConfig,
  type PricingConfigV2,
  type QuoteInputV2,
} from "../lib/quoteEngine";
import {
  clearActivePricingVersionCache,
  pricingAudit,
} from "../lib/quoteEngine/service";
import type { AppBindings } from "../types";

export const adminPricingV2Router = new Hono<AppBindings>();
adminPricingV2Router.use("*", requireAuth, requireAdmin);
const editGate = requireAdminRole("finance");

interface VersionRow {
  id: string;
  name: string;
  service_area: string;
  currency: string;
  status: string;
  config: PricingConfigV2;
  inference_provenance: string;
  source_version_id: string | null;
  change_summary: string | null;
  validation: unknown;
  effective_at: string | null;
  created_by_clerk_id: string | null;
  published_by_clerk_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

async function getVersion(sql: ReturnType<typeof getDb>, id: string): Promise<VersionRow | null> {
  const rows = (await sql`SELECT * FROM pricing_versions WHERE id = ${id} LIMIT 1`) as VersionRow[];
  return rows[0] ?? null;
}

function summarize(v: VersionRow) {
  const { config: _config, ...rest } = v;
  return rest;
}

/** Run every reference scenario against a config; per-scenario failure is
 *  reported, never thrown, so previews always render. */
function runScenarios(config: PricingConfigV2, versionId: string) {
  return REFERENCE_SCENARIOS.map((s) => {
    try {
      const q = computeQuoteV2(config, s.input, { pricingVersionId: versionId });
      return {
        key: s.key,
        label: s.label,
        totalCents: q.totalCents,
        expectedLaborMinutes: q.expectedLaborMinutes,
        scheduledLaborMinutes: q.scheduledLaborMinutes,
        cleanerPayoutCents: q.cleanerPayoutCents,
        marginCents: q.subtotalCents - q.cleanerPayoutCents,
      };
    } catch (err) {
      return { key: s.key, label: s.label, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

adminPricingV2Router.get("/versions", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT id, name, service_area, currency, status, inference_provenance,
           source_version_id, change_summary, effective_at, created_by_clerk_id,
           published_by_clerk_id, published_at, created_at, updated_at
    FROM pricing_versions
    ORDER BY created_at DESC
    LIMIT 200
  `) as VersionRow[];
  return c.json({ versions: rows });
});

adminPricingV2Router.get("/versions/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const v = await getVersion(sql, c.req.param("id"));
  if (!v) return c.json({ error: "Not found" }, 404);
  return c.json({ version: v, scenarios: runScenarios(v.config, v.id) });
});

adminPricingV2Router.get("/audit", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const versionId = c.req.query("versionId") || null;
  const rows = (await sql`
    SELECT id, version_id, actor_clerk_id, event, detail, created_at
    FROM pricing_audit_events
    WHERE (${versionId}::uuid IS NULL OR version_id = ${versionId})
    ORDER BY created_at DESC
    LIMIT 300
  `) as unknown[];
  return c.json({ events: rows });
});

/** Structured diff + reference-scenario impact of a draft vs the Active
 *  version — powers Change review. */
adminPricingV2Router.get("/versions/:id/impact", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const draft = await getVersion(sql, c.req.param("id"));
  if (!draft) return c.json({ error: "Not found" }, 404);
  const activeRows = (await sql`
    SELECT * FROM pricing_versions
    WHERE status = 'active' AND service_area = ${draft.service_area} AND currency = ${draft.currency}
    LIMIT 1
  `) as VersionRow[];
  const active = activeRows[0] ?? null;
  const draftScenarios = runScenarios(draft.config, draft.id);
  const activeScenarios = active ? runScenarios(active.config, active.id) : null;
  return c.json({
    draft: summarize(draft),
    active: active ? summarize(active) : null,
    warnings: active ? diffWarnings(active.config, draft.config) : [],
    scenarios: draftScenarios.map((d) => ({
      ...d,
      before: activeScenarios?.find((a) => a.key === d.key) ?? null,
    })),
    validation: validatePricingConfig(draft.config),
  });
});

// ---------------------------------------------------------------------------
// MCP sandbox proposals → Studio drafts (the payload-autofill bridge)
//
// LLM-drafted configs land in mcp_simulator_configs (migration 100, written
// ONLY by the quarantined MCP worker). Listing them here and importing one as
// a DRAFT pricing version lets an admin open the proposal in Pricing Studio
// with every field pre-filled and individually editable — the draft then
// flows through the normal validate/test-quote/publish pipeline. The MCP
// itself still has NO path to pricing_versions: import (like publish) only
// happens here, behind admin auth + the finance edit gate.
// ---------------------------------------------------------------------------

adminPricingV2Router.get("/proposals", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  try {
    const rows = (await sql`
      SELECT id, admin_email, name, notes, based_on_version_id, created_at, updated_at
      FROM mcp_simulator_configs
      ORDER BY updated_at DESC
      LIMIT 100
    `) as unknown[];
    return c.json({ proposals: rows });
  } catch (err) {
    // Pre-migration or transient failure — the Studio just shows none.
    logger.warn("mcp proposals list failed", { message: err instanceof Error ? err.message : String(err) });
    return c.json({ proposals: [] });
  }
});

const importProposalSchema = z.object({
  /** Optional draft name; defaults to the proposal's sandbox name. */
  name: z.string().trim().min(1).max(120).optional(),
});

adminPricingV2Router.post(
  "/proposals/:id/import",
  editGate,
  zValidator("json", importProposalSchema),
  async (c) => {
    const id = c.req.param("id");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: "Invalid proposal id" }, 400);
    const body = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const actor = c.get("user").clerkId;

    const rows = (await sql`
      SELECT id, admin_email, name, config, notes, based_on_version_id, updated_at
      FROM mcp_simulator_configs WHERE id = ${id}::uuid LIMIT 1
    `) as Array<{
      id: string;
      admin_email: string;
      name: string;
      config: PricingConfigV2;
      notes: string | null;
      based_on_version_id: string | null;
      updated_at: string;
    }>;
    const proposal = rows[0];
    if (!proposal) return c.json({ error: "Proposal not found" }, 404);

    // Validate before creating the draft. A structurally broken config (the
    // MCP normally can't store one) is refused rather than imported.
    let validation;
    try {
      validation = validatePricingConfig(proposal.config);
    } catch (err) {
      return c.json(
        {
          error: "invalid_config",
          message: `Proposal config is structurally invalid: ${err instanceof Error ? err.message : String(err)}`,
        },
        400,
      );
    }

    const draftName = body.name ?? proposal.name;
    const created = (await sql`
      INSERT INTO pricing_versions (name, status, config, inference_provenance, source_version_id,
                                    validation, created_by_clerk_id)
      VALUES (${draftName}, 'draft', ${JSON.stringify(proposal.config)},
              ${proposal.config.inference?.provenance ?? "cold_start"}, NULL,
              ${JSON.stringify(validation)}, ${actor})
      RETURNING *
    `) as VersionRow[];

    // Provenance lands in the append-only audit trail (queryable by version),
    // deliberately NOT as an FK — the sandbox stays decoupled from live
    // pricing (migration 100 quarantine note).
    await pricingAudit(sql, {
      versionId: created[0].id,
      actorClerkId: actor,
      event: "draft_created",
      detail: {
        source: "mcp_proposal",
        proposalId: proposal.id,
        proposalName: proposal.name,
        proposalAdmin: proposal.admin_email,
        proposalUpdatedAt: proposal.updated_at,
        basedOnVersionId: proposal.based_on_version_id,
        notes: proposal.notes,
      },
    });
    return c.json({ version: created[0], validation }, 201);
  },
);

// ---------------------------------------------------------------------------
// Preview / simulate (production engine in non-persisting mode)
// ---------------------------------------------------------------------------

const previewSchema = z.object({
  versionId: z.string().uuid().optional(),
  config: z.unknown().optional(),
  input: z.unknown(),
});

adminPricingV2Router.post("/preview", zValidator("json", previewSchema), async (c) => {
  const body = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  let config: PricingConfigV2 | null = null;
  let versionId = "preview";
  if (body.versionId) {
    const v = await getVersion(sql, body.versionId);
    if (!v) return c.json({ error: "Version not found" }, 404);
    config = v.config;
    versionId = v.id;
  } else if (body.config) {
    config = body.config as PricingConfigV2;
    const validation = validatePricingConfig(config);
    if (!validation.ok) return c.json({ error: "invalid_config", validation }, 400);
  }
  if (!config) return c.json({ error: "Provide versionId or config" }, 400);
  try {
    const result = computeQuoteV2(config, body.input as QuoteInputV2, { pricingVersionId: versionId });
    return c.json({ result });
  } catch (err) {
    if (err instanceof QuoteInputError) {
      return c.json({ error: err.code, message: err.message }, 400);
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// Mutations (drafts only; published versions are immutable)
// ---------------------------------------------------------------------------

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sourceVersionId: z.string().uuid().optional(),
});

adminPricingV2Router.post("/versions", editGate, zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const actor = c.get("user").clerkId;

  let config: PricingConfigV2;
  let provenance = "cold_start";
  let sourceId: string | null = null;
  if (body.sourceVersionId) {
    const source = await getVersion(sql, body.sourceVersionId);
    if (!source) return c.json({ error: "Source version not found" }, 404);
    config = source.config;
    provenance = source.inference_provenance;
    sourceId = source.id;
  } else {
    config = buildColdStartConfig();
  }

  const validation = validatePricingConfig(config);
  const rows = (await sql`
    INSERT INTO pricing_versions (name, status, config, inference_provenance, source_version_id,
                                  validation, created_by_clerk_id)
    VALUES (${body.name}, 'draft', ${JSON.stringify(config)}, ${provenance}, ${sourceId},
            ${JSON.stringify(validation)}, ${actor})
    RETURNING *
  `) as VersionRow[];
  await pricingAudit(sql, {
    versionId: rows[0].id,
    actorClerkId: actor,
    event: sourceId ? "draft_cloned" : "draft_created",
    detail: { name: body.name, sourceVersionId: sourceId },
  });
  return c.json({ version: rows[0] }, 201);
});

const configSchema = z.object({
  config: z.unknown(),
  note: z.string().max(500).optional(),
});

adminPricingV2Router.put("/versions/:id/config", editGate, zValidator("json", configSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const actor = c.get("user").clerkId;
  const v = await getVersion(sql, id);
  if (!v) return c.json({ error: "Not found" }, 404);
  if (v.status !== "draft") {
    return c.json({ error: "immutable_version", message: "Published pricing is immutable — clone it into a new draft to make changes." }, 409);
  }
  const config = body.config as PricingConfigV2;
  const validation = validatePricingConfig(config);
  const rows = (await sql`
    UPDATE pricing_versions
    SET config = ${JSON.stringify(config)}, validation = ${JSON.stringify(validation)},
        inference_provenance = ${config.inference?.provenance ?? v.inference_provenance},
        updated_at = NOW()
    WHERE id = ${id} AND status = 'draft'
    RETURNING *
  `) as VersionRow[];
  if (!rows[0]) return c.json({ error: "immutable_version" }, 409);
  await pricingAudit(sql, {
    versionId: id,
    actorClerkId: actor,
    event: "draft_edited",
    detail: { note: body.note ?? null, validationOk: validation.ok, errors: validation.errors.length },
  });
  return c.json({ version: rows[0], validation });
});

const publishSchema = z.object({
  changeSummary: z.string().trim().min(5).max(1000),
  /** Omit for immediate activation; future ISO instant to schedule. */
  effectiveAt: z.string().datetime().optional(),
});

adminPricingV2Router.post("/versions/:id/publish", editGate, zValidator("json", publishSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const actor = c.get("user").clerkId;
  const v = await getVersion(sql, id);
  if (!v) return c.json({ error: "Not found" }, 404);
  if (v.status !== "draft") return c.json({ error: "not_a_draft" }, 409);

  const validation = validatePricingConfig(v.config);
  if (!validation.ok) {
    return c.json({ error: "validation_failed", validation }, 400);
  }

  if (body.effectiveAt) {
    const at = new Date(body.effectiveAt);
    if (!(at.getTime() > Date.now())) {
      return c.json({ error: "effective_in_past", message: "Effective time must be in the future (UTC)." }, 400);
    }
    const rows = (await sql`
      UPDATE pricing_versions
      SET status = 'scheduled', effective_at = ${at.toISOString()},
          change_summary = ${body.changeSummary}, validation = ${JSON.stringify(validation)},
          published_by_clerk_id = ${actor}, published_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND status = 'draft'
      RETURNING *
    `) as VersionRow[];
    if (!rows[0]) return c.json({ error: "not_a_draft" }, 409);
    await pricingAudit(sql, {
      versionId: id,
      actorClerkId: actor,
      event: "scheduled",
      detail: { effectiveAt: at.toISOString(), changeSummary: body.changeSummary },
    });
    return c.json({ version: rows[0] });
  }

  // Immediate activation: supersede the current active version, then claim.
  // (Single-statement driver; the partial unique index makes racing publishes
  // safe — the loser 23505s and reports a conflict.)
  await sql`
    UPDATE pricing_versions SET status = 'superseded', effective_end = NOW(), updated_at = NOW()
    WHERE status = 'active' AND service_area = ${v.service_area} AND currency = ${v.currency}
  `;
  let activated: VersionRow[] = [];
  try {
    activated = (await sql`
      UPDATE pricing_versions
      SET status = 'active', effective_at = NOW(), change_summary = ${body.changeSummary},
          validation = ${JSON.stringify(validation)},
          published_by_clerk_id = ${actor}, published_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND status = 'draft'
      RETURNING *
    `) as VersionRow[];
  } catch (err) {
    await pricingAudit(sql, { versionId: id, actorClerkId: actor, event: "publish_conflict", detail: {} });
    return c.json({ error: "publish_conflict", message: "Another publish landed first — reload and review." }, 409);
  }
  if (!activated[0]) return c.json({ error: "not_a_draft" }, 409);
  clearActivePricingVersionCache();
  await pricingAudit(sql, {
    versionId: id,
    actorClerkId: actor,
    event: "activated",
    detail: { via: "publish", changeSummary: body.changeSummary },
  });
  return c.json({ version: activated[0] });
});

adminPricingV2Router.post("/versions/:id/archive", editGate, async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);
  const actor = c.get("user").clerkId;
  // Archiving the ACTIVE version turns v2 off (bookings fall back to the
  // legacy engines) — the deliberate emergency exit. Drafts/scheduled archive
  // freely; superseded versions stay as history.
  const rows = (await sql`
    UPDATE pricing_versions SET status = 'archived', effective_end = NOW(), updated_at = NOW()
    WHERE id = ${id} AND status IN ('draft', 'scheduled', 'active')
    RETURNING id, status
  `) as Array<{ id: string; status: string }>;
  if (!rows[0]) return c.json({ error: "Not found or already immutable history" }, 409);
  clearActivePricingVersionCache();
  await pricingAudit(sql, { versionId: id, actorClerkId: actor, event: "archived", detail: {} });
  return c.json({ ok: true });
});
