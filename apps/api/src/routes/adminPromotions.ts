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
import { requireAuth } from "../middleware/auth";
import { requireAnyAdmin } from "../middleware/adminRoles";
import { getDb } from "../lib/db";
import { PROMO_TEMPLATES, getTemplate, seedTemplatePromotions } from "../lib/promotions";
import type { AppBindings } from "../types";

export const adminPromotionsRouter = new Hono<AppBindings>();

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
  const design = tpl?.design ?? { theme: "light", blocks: [{ type: "heading", text: name, align: "center" }] };
  const cta = tpl?.cta ?? { label: "Learn more", action: "dismiss", requireField: "none" };
  const display = tpl?.display ?? {
    placement: "modal",
    delaySeconds: 3,
    persist: false,
    frequency: "once",
    showOnFirstVisit: true,
  };
  const grants = tpl?.grantsFoundingMember ?? false;
  const aud = audience ?? tpl?.audience ?? "all";

  // Unique slug: base off name, disambiguate on collision.
  const base = slugify(name) || "promo";
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const existing = (await sql`SELECT 1 FROM promotions WHERE slug = ${slug} LIMIT 1`) as unknown[];
    if (existing.length === 0) break;
    slug = `${base}-${i}`;
  }

  const rows = (await sql`
    INSERT INTO promotions (slug, name, template_key, audience, status, design, cta, display, grants_founding_member, created_by)
    VALUES (${slug}, ${name}, ${templateKey ?? null}, ${aud}, 'draft',
            ${JSON.stringify(design)}::jsonb, ${JSON.stringify(cta)}::jsonb,
            ${JSON.stringify(display)}::jsonb, ${grants}, ${c.get("user").clerkId})
    RETURNING *
  `) as unknown[];
  return c.json({ promotion: rows[0] }, 201);
});

adminPromotionsRouter.get("/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const rows = (await sql`SELECT * FROM promotions WHERE id = ${id} LIMIT 1`) as unknown[];
  if (!rows[0]) return c.json({ error: "not_found" }, 404);
  const stats = (await sql`
    SELECT COUNT(*)::int AS claims,
           COUNT(*) FILTER (WHERE granted_founding)::int AS founders
    FROM promotion_claims WHERE promotion_id = ${id}
  `) as Array<{ claims: number; founders: number }>;
  return c.json({ promotion: rows[0], stats: stats[0] ?? { claims: 0, founders: 0 } });
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  audience: z.enum(["all", "visitors", "customers", "cleaners"]).optional(),
  status: z.enum(["draft", "active", "paused", "expired", "archived"]).optional(),
  design: z.record(z.string(), z.unknown()).optional(),
  cta: z.record(z.string(), z.unknown()).optional(),
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
  const design = b.design ? JSON.stringify(b.design) : JSON.stringify(p.design);
  const cta = b.cta ? JSON.stringify(b.cta) : JSON.stringify(p.cta);
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
      reward = ${reward}::jsonb,
      starts_at = ${startsAt}, expires_at = ${expiresAt}, max_claims = ${maxClaims},
      grants_founding_member = ${grants}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as unknown[];
  return c.json({ promotion: rows[0] });
});

const statusSchema = z.object({
  status: z.enum(["draft", "active", "paused", "expired", "archived"]),
});

adminPromotionsRouter.post("/:id/status", zValidator("json", statusSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    UPDATE promotions SET status = ${c.req.valid("json").status}, updated_at = NOW()
    WHERE id = ${c.req.param("id")} RETURNING id, status
  `) as unknown[];
  if (!rows[0]) return c.json({ error: "not_found" }, 404);
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
  if (rows[0].template_key && getTemplate(rows[0].template_key)) {
    await sql`UPDATE promotions SET status = 'archived', updated_at = NOW() WHERE id = ${id}`;
    return c.json({ ok: true, archived: true });
  }
  await sql`DELETE FROM promotions WHERE id = ${id}`;
  return c.json({ ok: true, deleted: true });
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
