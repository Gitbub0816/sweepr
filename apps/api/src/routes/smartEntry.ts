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
 * Smart Entry — customer self-service (connect a lock, choose the booking's
 * access method, authorize, revoke). Cleaner reveal/unlock lives in
 * routes/cleanerAccess.ts behind the homeAccess guard.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { getDb } from "../lib/db";
import { loadSmartEntryConfig } from "../lib/smartEntryConfig";
import { setBookingAccessMethod, provisionSmartEntry, revokeSmartEntry } from "../lib/smartEntry";
import { makeSeam } from "../lib/seam";
import { isMember } from "../lib/sweeprPlus";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";

export const smartEntryRouter = new Hono<AppBindings>();

smartEntryRouter.use("*", requireAuth);

const CONSENT_VERSION = "smart-entry-v1";

async function userId(sql: ReturnType<typeof getDb>, clerkId: string): Promise<string | null> {
  const r = (await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`) as Array<{ id: string }>;
  return r[0]?.id ?? null;
}

/** Feature status + whether this cleaning would incur the $5 fee. */
smartEntryRouter.get("/status", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadSmartEntryConfig(sql);
  const uid = await userId(sql, c.get("user").clerkId);
  const member = uid ? await isMember(sql, uid) : false;
  return c.json({
    enabled: cfg.smartEntryEnabled,
    remoteUnlockEnabled: cfg.remoteUnlockEnabled,
    manualCodeEnabled: cfg.manualCodeEnabled,
    feeCents: member ? 0 : cfg.nonmemberFeeCents,
    includedWithMembership: member,
  });
});

/** List the customer's connected smart-lock devices (synced from Seam). */
smartEntryRouter.get("/devices", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const uid = await userId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ devices: [] });
  const devices = (await sql`
    SELECT d.id, d.display_name, d.device_type, d.supports_remote_unlock,
           d.supports_temporary_codes, d.status
    FROM smart_lock_devices d
    JOIN smart_lock_connections cn ON cn.id = d.connection_id
    WHERE cn.customer_id = ${uid} AND cn.status = 'connected' AND d.status != 'removed'
    ORDER BY d.display_name
  `) as unknown[];
  return c.json({ devices });
});

/**
 * Sync devices from Seam for the customer's connection and upsert them. In this
 * MVP a single workspace connection is assumed; per-customer Connect Webview
 * onboarding is a follow-up. Safe no-op without SEAM_API_KEY.
 */
smartEntryRouter.post("/devices/sync", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadSmartEntryConfig(sql);
  if (!cfg.smartEntryEnabled || !c.env.SEAM_API_KEY) return c.json({ synced: 0, devices: [] });
  const uid = await userId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ error: "no_account" }, 400);

  // Ensure a connection row exists for this customer.
  const conn = (await sql`
    INSERT INTO smart_lock_connections (customer_id, provider, status, connected_at, last_health_check_at)
    VALUES (${uid}, 'seam', 'connected', NOW(), NOW())
    ON CONFLICT DO NOTHING
    RETURNING id
  `) as Array<{ id: string }>;
  const connRows =
    conn[0] ??
    ((await sql`SELECT id FROM smart_lock_connections WHERE customer_id = ${uid} ORDER BY created_at DESC LIMIT 1`) as Array<{
      id: string;
    }>)[0];
  const connectionId = connRows?.id;
  if (!connectionId) return c.json({ error: "no_connection" }, 500);

  try {
    const seam = makeSeam(c.env.SEAM_API_KEY);
    const devices = await seam.listDevices();
    let synced = 0;
    for (const d of devices) {
      const p = d.properties ?? {};
      await sql`
        INSERT INTO smart_lock_devices (
          connection_id, provider_device_reference, display_name, device_type,
          supports_remote_unlock, supports_remote_lock, supports_temporary_codes,
          supports_lock_status, status
        ) VALUES (
          ${connectionId}, ${d.device_id}, ${d.display_name ?? p.model?.display_name ?? "Smart lock"},
          ${d.device_type ?? null}, ${!!p.can_remotely_unlock}, ${!!p.can_remotely_lock},
          ${!!p.can_program_online_access_codes}, ${!!p.locked || !!p.online},
          ${p.online === false ? "offline" : "active"}
        )
        ON CONFLICT DO NOTHING
      `;
      synced++;
    }
    return c.json({ synced });
  } catch (err) {
    logger.error("seam device sync failed", err, { uid });
    return c.json({ error: "sync_failed" }, 502);
  }
});

const bookingAccessSchema = z.object({
  method: z.enum(["home", "keypad_code", "smart_entry", "lockbox", "front_desk", "other"]),
  deviceId: z.string().uuid().nullish(),
  secretValue: z.string().max(2000).nullish(),
  authorize: z.boolean().optional(), // explicit consent for smart_entry
});

/** Current access selection for a booking the caller owns. */
smartEntryRouter.get("/booking/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const uid = await userId(sql, c.get("user").clerkId);
  const rows = (await sql`
    SELECT a.access_method, a.lock_device_id, a.customer_authorized_at,
           a.access_starts_at, a.access_ends_at, a.revoked_at
    FROM booking_access_authorizations a
    JOIN bookings b ON b.id = a.booking_id
    JOIN customers cu ON cu.id = b.customer_id
    WHERE a.booking_id = ${c.req.param("id")} AND cu.user_id = ${uid}
    LIMIT 1
  `) as unknown[];
  return c.json({ authorization: rows[0] ?? null });
});

/** Set the booking's access method + (for smart_entry) authorize + provision. */
smartEntryRouter.put("/booking/:id", zValidator("json", bookingAccessSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadSmartEntryConfig(sql);
  const uid = await userId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ error: "no_account" }, 400);
  const bookingId = c.req.param("id");

  // Ownership check.
  const owns = (await sql`
    SELECT b.id FROM bookings b JOIN customers cu ON cu.id = b.customer_id
    WHERE b.id = ${bookingId} AND cu.user_id = ${uid} LIMIT 1
  `) as Array<{ id: string }>;
  if (!owns[0]) return c.json({ error: "not_found" }, 404);

  const body = c.req.valid("json");
  if (body.method === "smart_entry" && !cfg.smartEntryEnabled) {
    return c.json({ error: "smart_entry_disabled" }, 403);
  }

  const consent =
    body.method === "smart_entry" || body.authorize
      ? {
          version: CONSENT_VERSION,
          ip: c.req.header("CF-Connecting-IP") ?? null,
          sessionId: c.req.header("x-session-id") ?? null,
        }
      : null;
  if (body.method === "smart_entry" && !body.authorize) {
    return c.json({ error: "authorization_required" }, 400);
  }

  await setBookingAccessMethod(sql, c.env, {
    bookingId,
    method: body.method,
    deviceId: body.deviceId ?? null,
    secretValue: body.secretValue ?? null,
    consent,
  });

  if (body.method === "smart_entry") {
    await provisionSmartEntry(sql, c.env, bookingId);
  }
  return c.json({ ok: true });
});

/** Customer revokes access for a booking (spec §15). */
smartEntryRouter.post("/booking/:id/revoke", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const uid = await userId(sql, c.get("user").clerkId);
  const owns = (await sql`
    SELECT b.id FROM bookings b JOIN customers cu ON cu.id = b.customer_id
    WHERE b.id = ${c.req.param("id")} AND cu.user_id = ${uid} LIMIT 1
  `) as Array<{ id: string }>;
  if (!owns[0]) return c.json({ error: "not_found" }, 404);
  await revokeSmartEntry(sql, c.env, c.req.param("id"), "customer_revoked");
  return c.json({ ok: true });
});
