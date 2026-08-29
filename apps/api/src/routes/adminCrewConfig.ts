/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

// MOUNT: in apps/api/src/index.ts add
//        `import { adminCrewConfigRouter } from "./routes/adminCrewConfig";`
//        and mount it with `app.route("/admin/crew-config", adminCrewConfigRouter);`
//        (alongside the other /admin/* routers, e.g. adminZipPricingRouter).

/**
 * Admin — Team Cleans crew configuration.
 *   GET /admin/crew-config → { config, flags }
 *   PUT /admin/crew-config → merge a partial config over the current one and/or
 *                            toggle the Team Cleans feature flags.
 *
 * Operational/staffing knobs only (see lib/crew/crewConfig.ts). Pricing-facing
 * efficiency knobs live in the pricing version, not here. Admin-gated and
 * audited, mirroring adminZipPricing.ts / adminSmartEntry.ts.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { audit } from "../lib/audit";
import {
  loadCrewConfig,
  saveCrewConfig,
  isTeamFlagEnabled,
  TEAM_FLAG_KEYS,
  type CrewConfig,
  type TeamFlag,
} from "../lib/crew/crewConfig";
import type { AppBindings } from "../types";

export const adminCrewConfigRouter = new Hono<AppBindings>();

adminCrewConfigRouter.use("*", requireAuth, requireAdmin);

const FLAG_NAMES = Object.keys(TEAM_FLAG_KEYS) as TeamFlag[];

/** Read every Team Cleans feature flag into a plain boolean map. */
async function loadFlags(sql: ReturnType<typeof getDb>): Promise<Record<TeamFlag, boolean>> {
  const entries = await Promise.all(
    FLAG_NAMES.map(async (f) => [f, await isTeamFlagEnabled(sql, f)] as const),
  );
  return Object.fromEntries(entries) as Record<TeamFlag, boolean>;
}

adminCrewConfigRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const [config, flags] = await Promise.all([loadCrewConfig(sql), loadFlags(sql)]);
  return c.json({ config, flags });
});

/** A payout split must be positive numbers summing to 100. */
const splitArray = z
  .array(z.number().min(0).max(100))
  .min(1)
  .refine((arr) => Math.round(arr.reduce((a, b) => a + b, 0)) === 100, {
    message: "Each split must sum to 100",
  });

const configSchema = z
  .object({
    maxCrewSize: z.number().int().min(1).max(10),
    crewInvitationTtlMinutes: z.number().int().min(1).max(120),
    parallelInvitationCount: z.number().int().min(1).max(20),
    minUsefulMinutesPerCleaner: z.number().int().min(15).max(600),
    maxSoloElapsedMinutes: z.number().int().min(60).max(1440),
    targetMaxElapsedMinutes: z.number().int().min(60).max(1440),
    leadOverheadMinutes: z.number().int().min(0).max(240),
    crewSizeThresholdsPersonMinutes: z.record(z.string(), z.number().min(0).max(100000)),
    payoutSplitByCrewSize: z.record(z.string(), splitArray),
  })
  .partial();

const flagsSchema = z
  .object(Object.fromEntries(FLAG_NAMES.map((f) => [f, z.boolean()])) as Record<TeamFlag, z.ZodBoolean>)
  .partial();

const putSchema = z
  .object({ config: configSchema.optional(), flags: flagsSchema.optional() })
  .refine((b) => b.config || b.flags, { message: "Provide config and/or flags" });

adminCrewConfigRouter.put("/", zValidator("json", putSchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;

  // Config: merge the partial over the current, validated config, then persist.
  if (input.config) {
    const current = await loadCrewConfig(sql);
    const merged: CrewConfig = { ...current, ...input.config };
    await saveCrewConfig(sql, merged);
  }

  // Flags: upsert each provided boolean as a "true"/"false" site_settings value.
  if (input.flags) {
    for (const [flag, on] of Object.entries(input.flags) as [TeamFlag, boolean][]) {
      const key = TEAM_FLAG_KEYS[flag];
      await sql`
        INSERT INTO site_settings (key, value) VALUES (${key}, ${on ? "true" : "false"})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `;
    }
  }

  await audit(sql, {
    action: "admin.action",
    actorClerkId: clerkId,
    targetType: "site_settings",
    targetId: "crew_config",
    metadata: {
      crew: "config_update",
      configKeys: input.config ? Object.keys(input.config) : [],
      flags: input.flags ?? {},
    },
    timestamp: new Date().toISOString(),
  });

  const [config, flags] = await Promise.all([loadCrewConfig(sql), loadFlags(sql)]);
  return c.json({ config, flags });
});
