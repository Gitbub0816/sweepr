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
  type FoundingAudience,
} from "../lib/foundingMember";
import type { AppBindings } from "../types";

export const foundingRouter = new Hono<AppBindings>();

foundingRouter.use("*", requireAuth);

/** Resolve the caller's cleaner_id and/or customer_id from their clerk id. */
async function resolveIds(sql: ReturnType<typeof getDb>, clerkId: string) {
  const rows = (await sql`
    SELECT
      (SELECT cl.id FROM cleaners  cl JOIN users u ON u.id = cl.user_id  WHERE u.clerk_id = ${clerkId} LIMIT 1) AS cleaner_id,
      (SELECT cu.id FROM customers cu JOIN users u ON u.id = cu.user_id WHERE u.clerk_id = ${clerkId} LIMIT 1) AS customer_id
  `) as Array<{ cleaner_id: string | null; customer_id: string | null }>;
  return { cleanerId: rows[0]?.cleaner_id ?? null, customerId: rows[0]?.customer_id ?? null };
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
