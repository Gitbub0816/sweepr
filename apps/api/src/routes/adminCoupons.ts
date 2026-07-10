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
 * Admin coupons + milestones.
 *   GET    /admin/coupons                 → list (filter by status/source/theme/q)
 *   POST   /admin/coupons                 → manual grant (to email or user email)
 *   POST   /admin/coupons/:id/revoke      → revoke
 *   GET    /admin/coupons/milestones      → milestone rules
 *   POST   /admin/coupons/milestones      → create rule
 *   PUT    /admin/coupons/milestones/:id  → update rule
 *   DELETE /admin/coupons/milestones/:id  → delete rule
 *   POST   /admin/coupons/milestones/run  → evaluate rules now (cron also runs them)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireAnyAdmin } from "../middleware/adminRoles";
import { getDb } from "../lib/db";
import { grantCoupon, evaluateMilestones } from "../lib/coupons";
import type { AppBindings } from "../types";

export const adminCouponsRouter = new Hono<AppBindings>();

adminCouponsRouter.use("*", requireAuth, requireAnyAdmin);

const templateSchema = z.object({
  kind: z.enum(["percent_off", "amount_off", "free_addon"]),
  value: z.number().int().min(0).optional(),
  addonKey: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  theme: z.string().optional(),
  validDays: z.number().int().min(1).max(180).optional(),
  maxRedemptions: z.number().int().min(1).max(100).optional(),
  minBookingTotalCents: z.number().int().min(0).optional(),
  stackable: z.boolean().optional(),
  maxStack: z.number().int().min(2).max(20).optional(),
});

adminCouponsRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status");
  const q = c.req.query("q");
  const rows = (await sql`
    SELECT cp.*, u.email AS owner_email
    FROM coupons cp
    LEFT JOIN users u ON u.id = cp.user_id
    WHERE (${status ?? null}::text IS NULL OR cp.status = ${status ?? null})
      AND (${q ?? null}::text IS NULL
           OR cp.code ILIKE '%' || ${q ?? ""} || '%'
           OR cp.email ILIKE '%' || ${q ?? ""} || '%'
           OR u.email ILIKE '%' || ${q ?? ""} || '%')
    ORDER BY cp.created_at DESC
    LIMIT 200
  `) as unknown[];
  return c.json({ coupons: rows });
});

adminCouponsRouter.post(
  "/",
  zValidator("json", z.object({ email: z.string().email(), template: templateSchema })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const { email, template } = c.req.valid("json");
    // Attach directly to the account when one exists; otherwise email-bound.
    const users = (await sql`
      SELECT id FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
    `) as Array<{ id: string }>;
    const coupon = await grantCoupon(sql, {
      userId: users[0]?.id ?? null,
      email: users[0] ? null : email,
      template,
      source: template.theme ? "theme" : "admin",
      createdBy: c.get("user").clerkId,
    });
    if (!coupon) return c.json({ error: "invalid_template" }, 400);
    return c.json({ coupon }, 201);
  },
);

adminCouponsRouter.post("/:id/revoke", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    UPDATE coupons SET status = 'revoked' WHERE id = ${c.req.param("id")} AND status = 'active'
    RETURNING id
  `) as unknown[];
  return c.json({ ok: rows.length > 0 });
});

// ─── Milestones ──────────────────────────────────────────────────────────────

const milestoneSchema = z.object({
  ruleKey: z.string().min(1).regex(/^[a-z0-9_-]+$/),
  label: z.string().min(1),
  kind: z.enum([
    "nth_customer",
    "nth_cleaner",
    "nth_completed_booking",
    "cleaner_anniversary_years",
    "customer_anniversary_years",
  ]),
  threshold: z.number().int().min(1),
  coupon: templateSchema,
  active: z.boolean().optional(),
});

adminCouponsRouter.get("/milestones", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rules = (await sql`
    SELECT mr.*,
           (SELECT COUNT(*)::int FROM milestone_awards ma WHERE ma.rule_key = mr.rule_key) AS awarded
    FROM milestone_rules mr ORDER BY mr.created_at DESC
  `) as unknown[];
  return c.json({ rules });
});

adminCouponsRouter.post("/milestones", zValidator("json", milestoneSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const b = c.req.valid("json");
  try {
    const rows = (await sql`
      INSERT INTO milestone_rules (rule_key, label, kind, threshold, coupon, active)
      VALUES (${b.ruleKey}, ${b.label}, ${b.kind}, ${b.threshold},
              ${JSON.stringify(b.coupon)}::jsonb, ${b.active ?? true})
      RETURNING *
    `) as unknown[];
    return c.json({ rule: rows[0] }, 201);
  } catch {
    return c.json({ error: "rule_key_taken" }, 409);
  }
});

adminCouponsRouter.put("/milestones/:id", zValidator("json", milestoneSchema.partial()), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const b = c.req.valid("json");
  const cur = (await sql`SELECT * FROM milestone_rules WHERE id = ${c.req.param("id")} LIMIT 1`) as Array<
    Record<string, unknown>
  >;
  if (!cur[0]) return c.json({ error: "not_found" }, 404);
  const rows = (await sql`
    UPDATE milestone_rules SET
      label = ${b.label ?? (cur[0].label as string)},
      kind = ${b.kind ?? (cur[0].kind as string)},
      threshold = ${b.threshold ?? (cur[0].threshold as number)},
      coupon = ${b.coupon ? JSON.stringify(b.coupon) : JSON.stringify(cur[0].coupon)}::jsonb,
      active = ${b.active ?? (cur[0].active as boolean)}
    WHERE id = ${c.req.param("id")}
    RETURNING *
  `) as unknown[];
  return c.json({ rule: rows[0] });
});

adminCouponsRouter.delete("/milestones/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  await sql`DELETE FROM milestone_rules WHERE id = ${c.req.param("id")}`;
  return c.json({ ok: true });
});

adminCouponsRouter.post("/milestones/run", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const granted = await evaluateMilestones(sql);
  return c.json({ ok: true, granted });
});
