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
 * Founding Member self-service endpoints.
 *   GET  /founding/me            → the caller's founding status (cleaner + customer)
 *   POST /founding/welcome-seen  → dismiss the one-time congratulations screen
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { getDb } from "../lib/db";
import {
  getFoundingStatus,
  markWelcomeSeen,
  loadFoundingConfig,
  chooseBadgeColor,
  founderBadgeUrl,
  FOUNDER_BADGE_COLORS,
  type FoundingAudience,
} from "../lib/foundingMember";
import type { AppBindings } from "../types";

export const foundingRouter = new Hono<AppBindings>();

foundingRouter.use("*", requireAuth);

/** Resolve the caller's cleaner_id and/or customer_id (+ first names) from their clerk id. */
async function resolveIds(sql: ReturnType<typeof getDb>, clerkId: string) {
  const rows = (await sql`
    SELECT
      (SELECT cl.id FROM cleaners  cl JOIN users u ON u.id = cl.user_id  WHERE u.clerk_id = ${clerkId} LIMIT 1) AS cleaner_id,
      (SELECT cu.id FROM customers cu JOIN users u ON u.id = cu.user_id WHERE u.clerk_id = ${clerkId} LIMIT 1) AS customer_id,
      (SELECT cl.first_name FROM cleaners  cl JOIN users u ON u.id = cl.user_id  WHERE u.clerk_id = ${clerkId} LIMIT 1) AS cleaner_first,
      (SELECT cu.first_name FROM customers cu JOIN users u ON u.id = cu.user_id WHERE u.clerk_id = ${clerkId} LIMIT 1) AS customer_first
  `) as Array<{
    cleaner_id: string | null;
    customer_id: string | null;
    cleaner_first: string | null;
    customer_first: string | null;
  }>;
  return {
    cleanerId: rows[0]?.cleaner_id ?? null,
    customerId: rows[0]?.customer_id ?? null,
    cleanerFirst: rows[0]?.cleaner_first ?? null,
    customerFirst: rows[0]?.customer_first ?? null,
  };
}

foundingRouter.get("/me", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { cleanerId, customerId } = await resolveIds(sql, c.get("user").clerkId);
  const cfg = await loadFoundingConfig(sql);
  const [cleaner, customer] = await Promise.all([
    cleanerId ? getFoundingStatus(sql, "cleaner", cleanerId, cfg) : Promise.resolve(null),
    customerId ? getFoundingStatus(sql, "customer", customerId, cfg) : Promise.resolve(null),
  ]);
  return c.json({ cleaner, customer, bonusPct: cfg.earningsBonusPct });
});

/**
 * Badge color options for the caller. Preview URLs are built with the caller's
 * OWN first-name initial (inferred server-side — the initial is never a choice).
 */
foundingRouter.get("/badge-options", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { cleanerFirst, customerFirst } = await resolveIds(sql, c.get("user").clerkId);
  const firstName = cleanerFirst ?? customerFirst;
  return c.json({
    colors: FOUNDER_BADGE_COLORS.map((color) => ({
      color,
      previewUrl: founderBadgeUrl(color, firstName),
    })),
    note: "You can only pick your badge once — it can never be changed.",
  });
});

const badgeSchema = z.object({
  audience: z.enum(["cleaner", "customer"]),
  color: z.string().min(1),
});

/** One-time badge color pick. Permanent — the API refuses any later change. */
foundingRouter.post("/badge", zValidator("json", badgeSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { audience, color } = c.req.valid("json");
  const ids = await resolveIds(sql, c.get("user").clerkId);
  const id = audience === "cleaner" ? ids.cleanerId : ids.customerId;
  if (!id) return c.json({ error: "not_a_member" }, 404);

  const result = await chooseBadgeColor(sql, audience as FoundingAudience, id, color);
  if (result === "chosen") {
    const firstName = audience === "cleaner" ? ids.cleanerFirst : ids.customerFirst;
    return c.json({ ok: true, badgeUrl: founderBadgeUrl(color, firstName) });
  }
  const code = result === "invalid_color" ? 400 : result === "not_a_member" ? 404 : 409;
  return c.json({ error: result }, code);
});

const welcomeSchema = z.object({ audience: z.enum(["cleaner", "customer"]) });

foundingRouter.post("/welcome-seen", zValidator("json", welcomeSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { audience } = c.req.valid("json");
  const { cleanerId, customerId } = await resolveIds(sql, c.get("user").clerkId);
  const id = audience === "cleaner" ? cleanerId : customerId;
  if (!id) return c.json({ error: "not_a_member" }, 404);
  await markWelcomeSeen(sql, audience as FoundingAudience, id);
  return c.json({ ok: true });
});
