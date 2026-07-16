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
 * Admin CRUD for ZIP-code-specific pricing multipliers. Mounted at
 * /admin/zip-pricing (admin only). See lib/zipPricing.ts for the pricing
 * semantics (adjusts the overall booking total, not just the platform fee).
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { audit } from "../lib/audit";
import { listZipMultipliers, upsertZipMultiplier, deleteZipMultiplier } from "../lib/zipPricing";
import type { AppBindings } from "../types";

export const adminZipPricingRouter = new Hono<AppBindings>();
adminZipPricingRouter.use("*", requireAuth, requireAdmin);

adminZipPricingRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = await listZipMultipliers(sql);
  return c.json({ multipliers: rows });
});

const upsertSchema = z.object({
  zip: z.string().trim().regex(/^\d{5}$/, "ZIP must be 5 digits"),
  multiplierPct: z.number().min(-90).max(500),
  active: z.boolean().default(true),
  notes: z.string().trim().max(500).nullable().optional(),
});

adminZipPricingRouter.put("/", zValidator("json", upsertSchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const row = await upsertZipMultiplier(sql, {
    zip: input.zip,
    multiplierPct: input.multiplierPct,
    active: input.active,
    notes: input.notes ?? null,
    createdByClerkId: c.get("user").clerkId,
  });
  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "zip_pricing_multiplier",
    targetId: input.zip,
    metadata: { multiplierPct: input.multiplierPct, active: input.active },
    timestamp: new Date().toISOString(),
  });
  return c.json({ multiplier: row });
});

adminZipPricingRouter.delete("/:zip", async (c) => {
  const zip = c.req.param("zip");
  const sql = getDb(c.env.DATABASE_URL);
  const deleted = await deleteZipMultiplier(sql, zip);
  if (!deleted) return c.json({ error: "Not found" }, 404);
  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "zip_pricing_multiplier",
    targetId: zip,
    metadata: { deleted: true },
    timestamp: new Date().toISOString(),
  });
  return c.json({ ok: true });
});
