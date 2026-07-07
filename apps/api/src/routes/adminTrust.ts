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
 * Trust & Safety admin console — customer account status, address greylist,
 * and cleaner scope-review privilege management.
 *
 * Mounted at /admin-trust (requireAuth + admin only).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { audit } from "../lib/audit";
import type { AppBindings } from "../types";

export const adminTrustRouter = new Hono<AppBindings>();

adminTrustRouter.use("*", requireAuth, requireAdmin);

// ── Customer account status ─────────────────────────────────────────────────
adminTrustRouter.get("/customers", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status");

  // email lives on `users`, not `customers` — join to fetch it.
  const rows = (await sql`
    SELECT c.id, c.first_name, c.last_name, u.email,
           c.account_status, c.account_status_reason, c.account_status_until
    FROM customers c
    JOIN users u ON u.id = c.user_id
    WHERE (${status ?? null}::text IS NULL AND c.account_status <> 'normal')
       OR c.account_status = ${status ?? null}
    ORDER BY c.updated_at DESC NULLS LAST LIMIT 200
  `) as Array<Record<string, unknown>>;

  return c.json({
    customers: rows.map((r) => ({
      id: r.id,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
      email: r.email,
      accountStatus: r.account_status,
      accountStatusReason: r.account_status_reason,
      accountStatusUntil: r.account_status_until,
    })),
  });
});

const statusSchema = z.object({
  status: z.enum(["normal", "investigating", "restricted", "suspended", "banned"]),
  reason: z.string().max(2000).optional(),
  days: z.number().int().min(0).max(3650).optional(),
});

adminTrustRouter.post("/customers/:id/status", zValidator("json", statusSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const { status, reason, days } = c.req.valid("json");

  const rows = (days != null
    ? ((await sql`
        UPDATE customers
        SET account_status = ${status},
            account_status_reason = ${reason ?? null},
            account_status_until = NOW() + (${days} * INTERVAL '1 day'),
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING id
      `) as Array<{ id: string }>)
    : ((await sql`
        UPDATE customers
        SET account_status = ${status},
            account_status_reason = ${reason ?? null},
            account_status_until = NULL,
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING id
      `) as Array<{ id: string }>));
  if (!rows[0]) return c.json({ error: "Customer not found" }, 404);

  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "customer",
    targetId: id,
    metadata: { event: "customer_account_status_changed", status, reason: reason ?? null, days: days ?? null },
    ipAddress: c.req.header("CF-Connecting-IP"),
    userAgent: c.req.header("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  return c.json({ ok: true });
});

// ── Address greylist ────────────────────────────────────────────────────────
adminTrustRouter.get("/greylist", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT id, street_address, unit, city, state, zip, normalized_key, reason,
           customer_id, source_booking_id, created_at, expires_at
    FROM address_greylist
    ORDER BY created_at DESC LIMIT 500
  `) as Array<Record<string, unknown>>;
  return c.json({
    entries: rows.map((r) => ({
      id: r.id,
      streetAddress: r.street_address,
      unit: r.unit,
      city: r.city,
      state: r.state,
      zip: r.zip,
      normalizedKey: r.normalized_key,
      reason: r.reason,
      customerId: r.customer_id,
      sourceBookingId: r.source_booking_id,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    })),
  });
});

adminTrustRouter.delete("/greylist/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const rows = (await sql`DELETE FROM address_greylist WHERE id = ${id} RETURNING id`) as Array<{ id: string }>;
  if (!rows[0]) return c.json({ error: "Not found" }, 404);

  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "address_greylist",
    targetId: id,
    metadata: { event: "address_greylist_removed" },
    ipAddress: c.req.header("CF-Connecting-IP"),
    userAgent: c.req.header("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  return c.json({ ok: true });
});

// ── Cleaner privileges ──────────────────────────────────────────────────────
adminTrustRouter.get("/cleaner-privileges", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT cp.cleaner_id, cp.additional_attention_enabled, cp.refusal_request_enabled,
           cp.disabled_reason, cp.disabled_until,
           cl.first_name, cl.last_name
    FROM cleaner_privileges cp
    LEFT JOIN cleaners cl ON cl.id = cp.cleaner_id
    WHERE cp.additional_attention_enabled = FALSE OR cp.refusal_request_enabled = FALSE
    ORDER BY cp.disabled_until DESC NULLS LAST
  `) as Array<Record<string, unknown>>;
  return c.json({
    cleaners: rows.map((r) => ({
      cleanerId: r.cleaner_id,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
      additionalAttentionEnabled: r.additional_attention_enabled,
      refusalRequestEnabled: r.refusal_request_enabled,
      disabledReason: r.disabled_reason,
      disabledUntil: r.disabled_until,
    })),
  });
});

adminTrustRouter.post("/cleaner-privileges/:cleanerId/restore", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cleanerId = c.req.param("cleanerId");
  const rows = (await sql`
    UPDATE cleaner_privileges
    SET additional_attention_enabled = TRUE,
        refusal_request_enabled = TRUE,
        disabled_reason = NULL,
        disabled_until = NULL,
        updated_at = NOW()
    WHERE cleaner_id = ${cleanerId}
    RETURNING cleaner_id
  `) as Array<{ cleaner_id: string }>;
  if (!rows[0]) return c.json({ error: "Not found" }, 404);

  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "cleaner_privileges",
    targetId: cleanerId,
    metadata: { event: "cleaner_privileges_restored" },
    ipAddress: c.req.header("CF-Connecting-IP"),
    userAgent: c.req.header("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  return c.json({ ok: true });
});
