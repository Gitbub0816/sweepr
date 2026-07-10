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
 * Self-service coupons.
 *   GET /coupons/mine — the caller's active coupons. Also attaches any
 *   email-bound coupons from anonymous promo claims (sign-up is what makes a
 *   coupon spendable, per the Promotions & Coupons Terms). Coupons are silent:
 *   this list is the only surface — application at booking is automatic.
 */

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { getDb } from "../lib/db";
import { attachPendingCouponsByEmail, activeCouponsForUser } from "../lib/coupons";
import type { AppBindings } from "../types";

export const couponsRouter = new Hono<AppBindings>();

couponsRouter.use("*", requireAuth);

couponsRouter.get("/mine", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const { clerkId, email } = c.get("user");
  const rows = (await sql`
    SELECT id, email AS db_email FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `) as Array<{ id: string; db_email: string | null }>;
  if (!rows[0]) return c.json({ coupons: [] });

  await attachPendingCouponsByEmail(sql, rows[0].id, email ?? rows[0].db_email).catch(() => 0);
  const coupons = await activeCouponsForUser(sql, rows[0].id);
  return c.json({
    coupons: coupons.map((cp) => ({
      id: cp.id,
      code: cp.code,
      title: cp.title,
      description: cp.description,
      theme: cp.theme,
      kind: cp.kind,
      value: cp.value,
      addonKey: cp.addon_key,
      usesLeft: cp.max_redemptions - cp.redemption_count,
      minBookingTotalCents: cp.min_booking_total_cents,
      expiresAt: cp.expires_at,
    })),
  });
});
