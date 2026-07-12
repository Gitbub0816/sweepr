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
 * Admin — Smart Entry + Sweepr+ configuration and oversight (spec §19, §25).
 *   GET  /admin/smart-entry/config   → current config
 *   PUT  /admin/smart-entry/config   → update flags/prices/limits
 *   GET  /admin/smart-entry/events   → recent access events (NO credentials)
 *   POST /admin/smart-entry/booking/:id/revoke → emergency revoke
 *
 * The admin console never displays a working credential — only status/events.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireAnyAdmin } from "../middleware/adminRoles";
import { getDb } from "../lib/db";
import { loadSmartEntryConfig, saveSmartEntryConfig, DEFAULT_SMART_ENTRY_CONFIG } from "../lib/smartEntryConfig";
import { revokeSmartEntry } from "../lib/smartEntry";
import { audit } from "../lib/audit";
import type { AppBindings } from "../types";

export const adminSmartEntryRouter = new Hono<AppBindings>();

adminSmartEntryRouter.use("*", requireAuth, requireAnyAdmin);

adminSmartEntryRouter.get("/config", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  return c.json({ config: await loadSmartEntryConfig(sql) });
});

// All keys optional; merged over the current config so partial saves are safe.
const cfgSchema = z
  .object({
    smartEntryEnabled: z.boolean(),
    manualCodeEnabled: z.boolean(),
    remoteUnlockEnabled: z.boolean(),
    scheduledPinEnabled: z.boolean(),
    sweeprPlusEnabled: z.boolean(),
    nonmemberFeeCents: z.number().int().min(0).max(100000),
    memberIncluded: z.boolean(),
    accessStartOffsetMinutes: z.number().int().min(0).max(720),
    accessEndOffsetMinutes: z.number().int().min(0).max(720),
    maxGeofenceRadiusMeters: z.number().int().min(10).max(2000),
    maxLocationAgeSeconds: z.number().int().min(10).max(600),
    maxLocationAccuracyMeters: z.number().int().min(10).max(1000),
    requireBiometric: z.boolean(),
    requireDeviceAttestation: z.boolean(),
    reauthMaxAgeSeconds: z.number().int().min(30).max(3600),
    maxUnlockAttemptsPer10Min: z.number().int().min(1).max(50),
    maxCodeRevealsPerBooking: z.number().int().min(1).max(100),
    plusMonthlyPriceCents: z.number().int().min(0).max(1000000),
    plusAnnualPriceCents: z.number().int().min(0).max(10000000),
    plusDiscountPercent: z.number().int().min(0).max(100),
    plusMonthlyDiscountCapCents: z.number().int().min(0).max(1000000),
    plusPriorityBookingMinutes: z.number().int().min(0).max(1440),
    plusRescheduleBenefitEnabled: z.boolean(),
    plusGraceDays: z.number().int().min(0).max(90),
  })
  .partial();

adminSmartEntryRouter.put("/config", zValidator("json", cfgSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const current = await loadSmartEntryConfig(sql);
  const next = { ...DEFAULT_SMART_ENTRY_CONFIG, ...current, ...c.req.valid("json") };
  await saveSmartEntryConfig(sql, next);
  await audit(sql, {
    action: "smart_entry.config_updated",
    actorClerkId: c.get("user").clerkId,
    targetType: "smart_entry_config",
    targetId: "smart_entry_config",
    metadata: { keys: Object.keys(c.req.valid("json")) },
    timestamp: new Date().toISOString(),
  });
  return c.json({ config: next });
});

adminSmartEntryRouter.get("/events", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const bookingId = c.req.query("bookingId");
  const rows = (await sql`
    SELECT id, booking_id, cleaner_id, event_type, decision, denial_reason,
           location_distance_meters, occurred_at
    FROM home_access_events
    WHERE (${bookingId ?? null}::uuid IS NULL OR booking_id = ${bookingId ?? null}::uuid)
    ORDER BY occurred_at DESC
    LIMIT 200
  `) as unknown[];
  return c.json({ events: rows });
});

adminSmartEntryRouter.post("/booking/:id/revoke", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  await revokeSmartEntry(sql, c.env, c.req.param("id"), "admin_revoked");
  await audit(sql, {
    action: "smart_entry.access_revoked",
    actorClerkId: c.get("user").clerkId,
    targetType: "booking_access",
    targetId: c.req.param("id"),
    metadata: { action: "emergency_revoke" },
    timestamp: new Date().toISOString(),
  });
  return c.json({ ok: true });
});
