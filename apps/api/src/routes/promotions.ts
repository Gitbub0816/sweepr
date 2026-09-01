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
 * Public promotion widget API. These endpoints are reachable from the marketing
 * site (anonymous visitors) AND from the authenticated customer/cleaner apps, so
 * they do NOT require auth — but they DO opportunistically resolve a Clerk bearer
 * token when one is present, so a Founding Member claim can be attributed to the
 * signed-in account and grant status.
 *
 *   GET  /promotions/live?persona=visitor|customer|cleaner  → promos to show
 *   GET  /promotions/:slug                                   → one promo (direct URL)
 *   POST /promotions/:slug/impression                        → count a view
 *   POST /promotions/:slug/claim                             → claim / capture lead
 */

import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { verifyToken } from "@clerk/backend";
import { getDb } from "../lib/db";
import {
  getPromotionBySlug,
  listLivePromotions,
  recordImpression,
  claimPromotion,
  isLive,
  toPublicPromotionView,
} from "../lib/promotions";
import type { AppBindings } from "../types";

export const promotionsRouter = new Hono<AppBindings>();

/** Best-effort: resolve the signed-in user's id from an optional bearer token. */
async function optionalUserId(c: Context<AppBindings>): Promise<string | null> {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  try {
    // Try primary instance; fall back to admin instance if configured.
    let sub: string | undefined;
    try {
      sub = (await verifyToken(token, { secretKey: c.env.CLERK_SECRET_KEY })).sub;
    } catch {
      if (c.env.CLERK_ADMIN_SECRET_KEY) {
        sub = (await verifyToken(token, { secretKey: c.env.CLERK_ADMIN_SECRET_KEY })).sub;
      }
    }
    if (!sub) return null;
    const sql = getDb(c.env.DATABASE_URL);
    const rows = (await sql`SELECT id FROM users WHERE clerk_id = ${sub} LIMIT 1`) as Array<{
      id: string;
    }>;
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** Strip server-only / sensitive fields before returning a promo to the
 *  client, normalized to PromoDesignV2 regardless of the stored shape. */
function publicView(p: Awaited<ReturnType<typeof getPromotionBySlug>>) {
  if (!p) return null;
  return {
    ...toPublicPromotionView(p),
    display: p.display,
  };
}

promotionsRouter.get("/live", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const persona = (c.req.query("persona") ?? "visitor") as "visitor" | "customer" | "cleaner";
  const promos = await listLivePromotions(sql, persona);
  return c.json({ promotions: promos.map(publicView) });
});

promotionsRouter.get("/:slug", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const promo = await getPromotionBySlug(sql, c.req.param("slug"));
  if (!promo) return c.json({ error: "not_found" }, 404);
  // Direct-URL views are allowed even for non-active promos so an admin can
  // preview, but flag liveness so the client can disable the CTA if needed.
  return c.json({ promotion: publicView(promo), live: isLive(promo) });
});

promotionsRouter.post("/:slug/impression", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const promo = await getPromotionBySlug(sql, c.req.param("slug"));
  if (!promo) return c.json({ error: "not_found" }, 404);
  await recordImpression(sql, promo.id);
  return c.json({ ok: true });
});

const claimSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  // Which PromoCtaV2 the visitor actually clicked, by id. Optional so a
  // legacy-shaped or single-CTA promo (and any caller that hasn't been
  // updated) still resolves correctly — see ClaimInput.ctaId in
  // lib/promotions.ts.
  ctaId: z.string().max(80).optional(),
});

promotionsRouter.post("/:slug/claim", zValidator("json", claimSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const body = c.req.valid("json");
  const userId = await optionalUserId(c);
  const ip =
    c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  const result = await claimPromotion(sql, c.req.param("slug"), {
    email: body.email,
    phone: body.phone,
    ctaId: body.ctaId,
    userId,
    ip,
  });
  const code =
    result.status === "not_live"
      ? 410
      : result.status === "invalid_field"
        ? 400
        : result.status === "already_claimed"
          ? 409
          : 200;
  return c.json(result, code);
});
