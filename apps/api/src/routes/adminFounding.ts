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
 * Admin controls for the Founding Member Program:
 *   GET  /admin/founding/config           → enrollment settings + live counts
 *   PUT  /admin/founding/config           → update enrollment window / bonus
 *   GET  /admin/founding/members          → list founders (audience filter)
 *   POST /admin/founding/grant            → manual grant (force, ignores window)
 *   POST /admin/founding/revoke           → revoke with reason
 *   POST /admin/founding/restore          → restore a revoked member
 */

import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireAnyAdmin } from "../middleware/adminRoles";
import { getDb } from "../lib/db";
import { audit } from "../lib/audit";
import {
  loadFoundingConfig,
  enroll,
  revoke,
  restore,
  type FoundingAudience,
} from "../lib/foundingMember";
import type { AppBindings } from "../types";

export const adminFoundingRouter = new Hono<AppBindings>();

adminFoundingRouter.use("*", requireAuth, requireAnyAdmin);

/** Thin wrapper: the audit action union is fixed, so custom founding events are
 * recorded as `admin.action` with the specific verb kept in metadata. */
async function auditAction(
  c: Context<AppBindings>,
  sql: ReturnType<typeof getDb>,
  event: string,
  targetType: string,
  targetId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType,
    targetId,
    metadata: { event, ...meta },
    timestamp: new Date().toISOString(),
  });
}

const CONFIG_KEYS: Record<string, string> = {
  cleanerEnrollmentOpen: "founding.cleaner_enrollment_open",
  customerEnrollmentOpen: "founding.customer_enrollment_open",
  cleanerCutoffAt: "founding.cleaner_cutoff_at",
  customerCutoffAt: "founding.customer_cutoff_at",
  cleanerMaxMembers: "founding.cleaner_max_members",
  customerMaxMembers: "founding.customer_max_members",
  earningsBonusPct: "founding.earnings_bonus_pct",
  sinceLabel: "founding.since_label",
};

adminFoundingRouter.get("/config", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadFoundingConfig(sql);
  const counts = (await sql`
    SELECT
      (SELECT COUNT(*)::int FROM cleaners  WHERE founding_member = TRUE) AS cleaner_members,
      (SELECT COUNT(*)::int FROM customers WHERE founding_member = TRUE) AS customer_members
  `) as Array<{ cleaner_members: number; customer_members: number }>;
  return c.json({
    config: {
      cleanerEnrollmentOpen: cfg.cleanerEnrollmentOpen,
      customerEnrollmentOpen: cfg.customerEnrollmentOpen,
      cleanerCutoffAt: cfg.cleanerCutoffAt?.toISOString() ?? "",
      customerCutoffAt: cfg.customerCutoffAt?.toISOString() ?? "",
      cleanerMaxMembers: cfg.cleanerMaxMembers ?? "",
      customerMaxMembers: cfg.customerMaxMembers ?? "",
      earningsBonusPct: cfg.earningsBonusPct,
      sinceLabel: cfg.sinceLabel,
    },
    counts: counts[0] ?? { cleaner_members: 0, customer_members: 0 },
  });
});

const configSchema = z.object({
  cleanerEnrollmentOpen: z.boolean().optional(),
  customerEnrollmentOpen: z.boolean().optional(),
  cleanerCutoffAt: z.string().optional(),
  customerCutoffAt: z.string().optional(),
  cleanerMaxMembers: z.union([z.number(), z.string()]).optional(),
  customerMaxMembers: z.union([z.number(), z.string()]).optional(),
  earningsBonusPct: z.union([z.number(), z.string()]).optional(),
  sinceLabel: z.string().optional(),
});

adminFoundingRouter.put("/config", zValidator("json", configSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const body = c.req.valid("json");
  for (const [field, key] of Object.entries(CONFIG_KEYS)) {
    if (!(field in body)) continue;
    const raw = (body as Record<string, unknown>)[field];
    const value =
      typeof raw === "boolean" ? String(raw) : raw === null || raw === undefined ? "" : String(raw);
    await sql`
      INSERT INTO site_settings (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
    `;
  }
  await auditAction(c, sql, "founding.config.update", "settings", "founding", body);
  return c.json({ ok: true });
});

adminFoundingRouter.get("/members", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const audience = (c.req.query("audience") ?? "cleaner") as FoundingAudience;
  const rows =
    audience === "customer"
      ? ((await sql`
          SELECT cu.id, cu.first_name, cu.last_name, u.email,
                 cu.founding_member, cu.founding_member_id, cu.founding_member_since,
                 cu.founding_member_revoked, cu.founding_member_revoked_reason
          FROM customers cu JOIN users u ON u.id = cu.user_id
          WHERE cu.founding_member = TRUE OR cu.founding_member_revoked = TRUE
          ORDER BY cu.founding_member_id ASC NULLS LAST
        `) as unknown[])
      : ((await sql`
          SELECT cl.id, cl.first_name, cl.last_name, u.email, cl.status,
                 cl.founding_member, cl.founding_member_id, cl.founding_member_since,
                 cl.founding_member_revoked, cl.founding_member_revoked_reason
          FROM cleaners cl JOIN users u ON u.id = cl.user_id
          WHERE cl.founding_member = TRUE OR cl.founding_member_revoked = TRUE
          ORDER BY cl.founding_member_id ASC NULLS LAST
        `) as unknown[]);
  return c.json({ audience, members: rows });
});

const targetSchema = z.object({
  audience: z.enum(["cleaner", "customer"]),
  id: z.string().uuid(),
});

adminFoundingRouter.post(
  "/grant",
  zValidator("json", targetSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const { audience, id } = c.req.valid("json");
    const result = await enroll(sql, audience, id, { force: true });
    await auditAction(c, sql, "founding.grant", audience, id, { result });
    return c.json(result);
  },
);

adminFoundingRouter.post(
  "/revoke",
  zValidator("json", targetSchema.extend({ reason: z.string().min(1) })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const { audience, id, reason } = c.req.valid("json");
    const ok = await revoke(sql, audience, id, reason);
    await auditAction(c, sql, "founding.revoke", audience, id, { reason });
    return c.json({ ok });
  },
);

adminFoundingRouter.post(
  "/restore",
  zValidator("json", targetSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const { audience, id } = c.req.valid("json");
    const ok = await restore(sql, audience, id);
    await auditAction(c, sql, "founding.restore", audience, id, {});
    return c.json({ ok });
  },
);
