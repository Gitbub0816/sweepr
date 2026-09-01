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
 * Admin promotions engine + designer API.
 *   GET    /admin/promotions              → list (auto-seeds catalog templates)
 *   GET    /admin/promotions/templates    → catalog for the "new from template" picker
 *   POST   /admin/promotions              → create (blank or from template)
 *   GET    /admin/promotions/:id          → one (with claim stats)
 *   PUT    /admin/promotions/:id          → update design / cta / display / expiry / status
 *   POST   /admin/promotions/:id/status   → quick status change (activate/pause/archive)
 *   DELETE /admin/promotions/:id          → delete (cascades claims)
 *   GET    /admin/promotions/:id/claims   → claims list (leads / founders)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  PROMO_CTA_ACTIONS,
  PROMO_REQUIRE_FIELDS,
  PROMO_CLAIMANTS,
  PROMO_CTA_STYLES,
  PROMO_PAGE_MODES,
  PROMO_BLOCK_TYPES,
  PROMO_THEMES,
  PROMO_CANVAS_ASPECTS,
  PROMO_MAX_PAGES,
  PROMO_MAX_CTAS_PER_PAGE,
  validatePromoDesignV2Structure,
  type PromoDesignV2,
} from "@sweepr/utils";
import { requireAuth } from "../middleware/auth";
import { requireAnyAdmin } from "../middleware/adminRoles";
import { getDb } from "../lib/db";
import { audit } from "../lib/audit";
import { PROMO_TEMPLATES, getTemplate, seedTemplatePromotions, resolvePromoDesign } from "../lib/promotions";
import type { AppBindings } from "../types";

export const adminPromotionsRouter = new Hono<AppBindings>();

// ─── Design v2 zod schema ────────────────────────────────────────────────────
// Built FROM the shared constants in packages/utils/src/promoSchema.ts (the
// single source of truth for the enumerable option sets) but NOT imported
// from there — this worker owns its own zod wiring, and apps/mcp mirrors it
// independently with the SAME constants (see promotionTools.ts). The
// cross-cutting structural rules (page/CTA counts, code-mode byte cap,
// goto_page targets, entryPageKey, requireField sanity) are NOT re-derived
// here — `validatePromoDesignV2Structure` is the single implementation both
// this schema and the MCP's call from their own `superRefine`, so those
// semantics can never drift between the console and the MCP publish tool.
const promoCtaSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(200),
  action: z.enum(PROMO_CTA_ACTIONS),
  style: z.enum(PROMO_CTA_STYLES).optional(),
  url: z.string().max(2000).optional(),
  requireField: z.enum(PROMO_REQUIRE_FIELDS).optional(),
  claimants: z.enum(PROMO_CLAIMANTS).optional(),
  successMessage: z.string().max(500).optional(),
  targetPageKey: z.string().max(80).optional(),
});

const promoBlockSchema = z.object({
  type: z.enum(PROMO_BLOCK_TYPES),
  text: z.string().max(5000).optional(),
  src: z.string().max(2000).optional(),
  alt: z.string().max(300).optional(),
  items: z.array(z.string().max(500)).max(50).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  size: z.enum(["sm", "md", "lg", "xl"]).optional(),
});

const promoCanvasElementSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(["text", "image", "shape", "button"]),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().optional(),
  text: z.string().max(5000).optional(),
  fontSize: z.number().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  color: z.string().max(50).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  bg: z.string().max(80).optional(),
  src: z.string().max(2000).optional(),
  fit: z.enum(["cover", "contain"]).optional(),
  radius: z.number().optional(),
  shape: z.enum(["rect", "ellipse"]).optional(),
  fill: z.string().max(80).optional(),
  stroke: z.string().max(80).optional(),
  strokeWidth: z.number().optional(),
  cta: promoCtaSchema.optional(),
  btnBg: z.string().max(80).optional(),
  btnColor: z.string().max(80).optional(),
});

const promoCanvasSchema = z.object({
  aspect: z.enum(PROMO_CANVAS_ASPECTS).optional(),
  background: z.string().max(500).optional(),
  backgroundImage: z.string().max(2000).optional(),
  elements: z.array(promoCanvasElementSchema).max(200),
});

const promoHotspotSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  cta: promoCtaSchema,
});

const promoPosterSchema = z.object({
  src: z.string().max(2000),
  hotspots: z.array(promoHotspotSchema).max(50).optional(),
});

const promoCodeSchema = z.object({
  html: z.string().max(200_000),
  css: z.string().max(200_000).optional(),
  js: z.string().max(200_000).optional(),
});

const promoPageSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/, "Page key may contain only letters, numbers, - and _"),
  name: z.string().max(200).optional(),
  mode: z.enum(PROMO_PAGE_MODES),
  theme: z.enum(PROMO_THEMES).optional(),
  background: z.string().max(500).optional(),
  accent: z.string().max(80).optional(),
  blocks: z.array(promoBlockSchema).max(100).optional(),
  canvas: promoCanvasSchema.optional(),
  poster: promoPosterSchema.optional(),
  code: promoCodeSchema.optional(),
  ctas: z.array(promoCtaSchema).max(PROMO_MAX_CTAS_PER_PAGE),
});

const promoDesignV2Schema = z
  .object({
    version: z.literal(2),
    theme: z.enum(PROMO_THEMES).optional(),
    accent: z.string().max(80).optional(),
    background: z.string().max(500).optional(),
    entryPageKey: z.string().min(1).max(80),
    pages: z.array(promoPageSchema).min(1).max(PROMO_MAX_PAGES),
  })
  .superRefine((design, ctx) => {
    const errors = validatePromoDesignV2Structure(design as unknown as PromoDesignV2);
    for (const message of errors) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  });

adminPromotionsRouter.use("*", requireAuth, requireAnyAdmin);

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

adminPromotionsRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  // Auto-materialize any catalog templates that aren't in the DB yet.
  await seedTemplatePromotions(sql);
  const rows = (await sql`
    SELECT id, slug, name, template_key, audience, status, grants_founding_member,
           starts_at, expires_at, max_claims, claim_count, view_count, updated_at
    FROM promotions
    ORDER BY updated_at DESC
  `) as unknown[];
  return c.json({ promotions: rows });
});

adminPromotionsRouter.get("/templates", (c) =>
  c.json({
    templates: PROMO_TEMPLATES.map((t) => ({
      templateKey: t.templateKey,
      name: t.name,
      audience: t.audience,
      grantsFoundingMember: t.grantsFoundingMember,
    })),
  }),
);

const createSchema = z.object({
  name: z.string().min(1),
  templateKey: z.string().optional(),
  audience: z.enum(["all", "visitors", "customers", "cleaners"]).optional(),
});

adminPromotionsRouter.post("/", zValidator("json", createSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { name, templateKey, audience } = c.req.valid("json");

  const tpl = templateKey ? getTemplate(templateKey) : undefined;
  const display = tpl?.display ?? {
    placement: "modal",
    delaySeconds: 3,
    persist: false,
    frequency: "once",
    showOnFirstVisit: true,
  };
  const grants = tpl?.grantsFoundingMember ?? false;
  const aud = audience ?? tpl?.audience ?? "all";

  // A template still seeds the legacy (design_version 1) shape it always has
  // — the read-time normalizer upgrades it for the editor exactly like any
  // other pre-v2 row, and the first save writes it back as v2. A BLANK
  // promotion (no template) is authored straight into the new multi-page
  // shape since there's no legacy data to preserve either way.
  let design: unknown;
  let ctaColumn: unknown;
  let designVersion: 1 | 2;
  if (tpl) {
    design = tpl.design;
    ctaColumn = tpl.cta;
    designVersion = 1;
  } else {
    design = {
      version: 2,
      theme: "light",
      entryPageKey: "page-1",
      pages: [
        {
          key: "page-1",
          name: "Page 1",
          mode: "blocks",
          blocks: [{ type: "heading", text: name, align: "center" }],
          ctas: [{ id: "cta-1", label: "Learn more", action: "dismiss", style: "primary" }],
        },
      ],
    } satisfies PromoDesignV2;
    ctaColumn = {};
    designVersion = 2;
  }

  // Unique slug: base off name, disambiguate on collision.
  const base = slugify(name) || "promo";
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const existing = (await sql`SELECT 1 FROM promotions WHERE slug = ${slug} LIMIT 1`) as unknown[];
    if (existing.length === 0) break;
    slug = `${base}-${i}`;
  }

  const rows = (await sql`
    INSERT INTO promotions (
      slug, name, template_key, audience, status, design, cta, display,
      grants_founding_member, created_by, design_version, created_via
    )
    VALUES (${slug}, ${name}, ${templateKey ?? null}, ${aud}, 'draft',
            ${JSON.stringify(design)}::jsonb, ${JSON.stringify(ctaColumn)}::jsonb,
            ${JSON.stringify(display)}::jsonb, ${grants}, ${c.get("user").clerkId},
            ${designVersion}, 'console')
    RETURNING *
  `) as unknown[];
  const created = rows[0] as { id: string };
  await audit(sql, {
    action: "promotion.created",
    actorClerkId: c.get("user").clerkId,
    targetType: "promotion",
    targetId: created.id,
    metadata: { name, templateKey: templateKey ?? null, audience: aud },
    timestamp: new Date().toISOString(),
  });
  return c.json({ promotion: created }, 201);
});

adminPromotionsRouter.get("/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const rows = (await sql`SELECT * FROM promotions WHERE id = ${id} LIMIT 1`) as Array<
    Record<string, unknown>
  >;
  if (!rows[0]) return c.json({ error: "not_found" }, 404);
  const stats = (await sql`
    SELECT COUNT(*)::int AS claims,
           COUNT(*) FILTER (WHERE granted_founding)::int AS founders
    FROM promotion_claims WHERE promotion_id = ${id}
  `) as Array<{ claims: number; founders: number }>;
  // The admin designer always works in v2 space — normalize a legacy row's
  // `design` in the response so the frontend never has to branch on shape.
  const row = rows[0];
  const normalizedDesign = resolvePromoDesign({
    design: row.design as Parameters<typeof resolvePromoDesign>[0]["design"],
    cta: row.cta as Parameters<typeof resolvePromoDesign>[0]["cta"],
    design_version: row.design_version as number,
  });
  return c.json({
    promotion: { ...row, design: normalizedDesign },
    stats: stats[0] ?? { claims: 0, founders: 0 },
  });
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  audience: z.enum(["all", "visitors", "customers", "cleaners"]).optional(),
  status: z.enum(["draft", "active", "paused", "expired", "archived"]).optional(),
  // Always the v2 shape — the rebuilt admin designer never sends anything
  // else. A promo not yet touched by the new editor keeps its legacy
  // (design_version 1) row untouched until its first save through here.
  design: promoDesignV2Schema.optional(),
  display: z.record(z.string(), z.unknown()).optional(),
  reward: z.record(z.string(), z.unknown()).optional(),
  startsAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  maxClaims: z.number().int().positive().nullable().optional(),
  grantsFoundingMember: z.boolean().optional(),
});

adminPromotionsRouter.put("/:id", zValidator("json", updateSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const b = c.req.valid("json");

  // Neon tagged templates aren't composable, so read-merge-write: start from the
  // current row and overlay only the provided fields. `undefined` = keep,
  // explicit `null` (startsAt/expiresAt/maxClaims) = clear.
  const cur = (await sql`SELECT * FROM promotions WHERE id = ${id} LIMIT 1`) as Array<
    Record<string, unknown>
  >;
  if (!cur[0]) return c.json({ error: "not_found" }, 404);
  const p = cur[0];

  const name = b.name ?? (p.name as string);
  const audience = b.audience ?? (p.audience as string);
  const status = b.status ?? (p.status as string);
  // Saving a v2 design always upgrades the row (design_version → 2) and
  // retires the legacy `cta` column to an empty object — it's unused once
  // every CTA lives inside `design.pages[].ctas`, but the column itself is
  // kept (never dropped) per migration 108's comment.
  const design = b.design ? JSON.stringify(b.design) : JSON.stringify(p.design);
  const cta = b.design ? "{}" : JSON.stringify(p.cta);
  const designVersion = b.design ? 2 : (p.design_version as number);
  const display = b.display ? JSON.stringify(b.display) : JSON.stringify(p.display);
  const reward = b.reward ? JSON.stringify(b.reward) : JSON.stringify(p.reward ?? {});
  const startsAt = b.startsAt === undefined ? (p.starts_at as string | null) : b.startsAt;
  const expiresAt = b.expiresAt === undefined ? (p.expires_at as string | null) : b.expiresAt;
  const maxClaims = b.maxClaims === undefined ? (p.max_claims as number | null) : b.maxClaims;
  const grants =
    b.grantsFoundingMember ?? (p.grants_founding_member as boolean);

  const rows = (await sql`
    UPDATE promotions SET
      name = ${name}, audience = ${audience}, status = ${status},
      design = ${design}::jsonb, cta = ${cta}::jsonb, display = ${display}::jsonb,
      reward = ${reward}::jsonb, design_version = ${designVersion},
      starts_at = ${startsAt}, expires_at = ${expiresAt}, max_claims = ${maxClaims},
      grants_founding_member = ${grants}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as unknown[];
  await audit(sql, {
    action: "promotion.updated",
    actorClerkId: c.get("user").clerkId,
    targetType: "promotion",
    targetId: id,
    metadata: {
      fields: Object.keys(b),
      statusChanged: b.status !== undefined && b.status !== p.status,
    },
    timestamp: new Date().toISOString(),
  });
  return c.json({ promotion: rows[0] });
});

const statusSchema = z.object({
  status: z.enum(["draft", "active", "paused", "expired", "archived"]),
});

adminPromotionsRouter.post("/:id/status", zValidator("json", statusSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { status } = c.req.valid("json");
  const rows = (await sql`
    UPDATE promotions SET status = ${status}, updated_at = NOW()
    WHERE id = ${c.req.param("id")} RETURNING id, status
  `) as unknown[];
  if (!rows[0]) return c.json({ error: "not_found" }, 404);
  await audit(sql, {
    action: "promotion.status_changed",
    actorClerkId: c.get("user").clerkId,
    targetType: "promotion",
    targetId: c.req.param("id"),
    metadata: { status },
    timestamp: new Date().toISOString(),
  });
  return c.json({ promotion: rows[0] });
});

adminPromotionsRouter.delete("/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  // Never delete a live template-seed row into oblivion by accident — archive
  // instead of hard-delete when it still maps to a catalog template.
  const rows = (await sql`SELECT template_key FROM promotions WHERE id = ${id} LIMIT 1`) as Array<{
    template_key: string | null;
  }>;
  if (!rows[0]) return c.json({ error: "not_found" }, 404);
  // A row that still maps to a catalog template is archived, not hard-deleted,
  // so the next template seed doesn't silently resurrect it as a fresh draft.
  const archived = Boolean(rows[0].template_key && getTemplate(rows[0].template_key));
  if (archived) {
    await sql`UPDATE promotions SET status = 'archived', updated_at = NOW() WHERE id = ${id}`;
  } else {
    await sql`DELETE FROM promotions WHERE id = ${id}`;
  }
  await audit(sql, {
    action: "promotion.deleted",
    actorClerkId: c.get("user").clerkId,
    targetType: "promotion",
    targetId: id,
    metadata: { archived },
    timestamp: new Date().toISOString(),
  });
  return c.json(archived ? { ok: true, archived: true } : { ok: true, deleted: true });
});

adminPromotionsRouter.get("/:id/claims", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT id, email, phone, field_value, granted_founding, claimed_at
    FROM promotion_claims WHERE promotion_id = ${c.req.param("id")}
    ORDER BY claimed_at DESC LIMIT 500
  `) as unknown[];
  return c.json({ claims: rows });
});
