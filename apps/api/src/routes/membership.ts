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
 * Sweepr+ membership — customer self-service.
 *   GET  /membership            → current status + benefit eligibility + pricing
 *   POST /membership/checkout   → Stripe Checkout subscription session
 *   POST /membership/cancel     → cancel at period end (keeps benefits till then)
 *   POST /membership/resume     → undo a pending cancellation
 *
 * The Stripe webhook (customer.subscription.*) is the source of truth for
 * membership status; these endpoints only initiate/queue changes.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { getDb } from "../lib/db";
import { getStripe } from "../lib/stripe";
import { loadSmartEntryConfig } from "../lib/smartEntryConfig";
import { getMembership, isBenefitEligible } from "../lib/sweeprPlus";
import { resolvePlusPriceId } from "../lib/sweeprPlusPlans";
import { SWEEPR_PLUS_META } from "../lib/stripeSubscriptions";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";

export const membershipRouter = new Hono<AppBindings>();

membershipRouter.use("*", requireAuth);

async function resolveUser(sql: ReturnType<typeof getDb>, clerkId: string) {
  const rows = (await sql`
    SELECT id, email FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `) as Array<{ id: string; email: string | null }>;
  return rows[0] ?? null;
}

membershipRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadSmartEntryConfig(sql);
  const user = await resolveUser(sql, c.get("user").clerkId);
  const m = user ? await getMembership(sql, user.id) : null;
  return c.json({
    enabled: cfg.sweeprPlusEnabled,
    member: isBenefitEligible(m),
    status: m?.status ?? null,
    cancelAtPeriodEnd: m?.cancel_at_period_end ?? false,
    currentPeriodEnd: m?.current_period_end ?? null,
    pricing: {
      monthlyCents: cfg.plusMonthlyPriceCents,
      annualCents: cfg.plusAnnualPriceCents,
      discountPercent: cfg.plusDiscountPercent,
      monthlyDiscountCapCents: cfg.plusMonthlyDiscountCapCents,
    },
  });
});

membershipRouter.post(
  "/checkout",
  zValidator("json", z.object({ interval: z.enum(["month", "year"]) })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const cfg = await loadSmartEntryConfig(sql);
    if (!cfg.sweeprPlusEnabled) return c.json({ error: "sweepr_plus_disabled" }, 403);

    const user = await resolveUser(sql, c.get("user").clerkId);
    if (!user) return c.json({ error: "no_account" }, 400);

    // Already an active member? Don't let them double-subscribe.
    const existing = await getMembership(sql, user.id);
    if (isBenefitEligible(existing) && existing?.status !== "past_due") {
      return c.json({ error: "already_member" }, 409);
    }

    const { interval } = c.req.valid("json");
    const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
    const appUrl = c.env.CUSTOMER_URL ?? "https://app.getsweepr.com";
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: resolvePlusPriceId(c.env, interval), quantity: 1 }],
        customer_email: user.email ?? c.get("user").email ?? undefined,
        client_reference_id: user.id,
        // Tag the subscription so the webhook can identify + attribute it.
        subscription_data: { metadata: { type: SWEEPR_PLUS_META, user_id: user.id } },
        metadata: { type: SWEEPR_PLUS_META, user_id: user.id },
        allow_promotion_codes: true,
        success_url: `${appUrl}/account/membership?status=success`,
        cancel_url: `${appUrl}/account/membership?status=cancelled`,
      });
      return c.json({ url: session.url });
    } catch (err) {
      logger.error("sweepr+ checkout failed", err, { userId: user.id });
      return c.json({ error: "checkout_failed" }, 502);
    }
  },
);

membershipRouter.post("/cancel", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await resolveUser(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "no_account" }, 400);
  const m = await getMembership(sql, user.id);
  if (!m || !["active", "trialing", "past_due"].includes(m.status)) {
    return c.json({ error: "no_active_membership" }, 404);
  }
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  const subs = (await sql`
    SELECT stripe_subscription_id FROM sweepr_plus_memberships WHERE id = ${m.id} LIMIT 1
  `) as Array<{ stripe_subscription_id: string | null }>;
  const subId = subs[0]?.stripe_subscription_id;
  if (!subId) return c.json({ error: "no_subscription" }, 404);
  try {
    // Cancel at period end — benefits remain through the paid period (spec §5.4).
    await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    await sql`
      UPDATE sweepr_plus_memberships SET cancel_at_period_end = TRUE, updated_at = NOW()
      WHERE id = ${m.id}
    `;
    return c.json({ ok: true, cancelAtPeriodEnd: true });
  } catch (err) {
    logger.error("sweepr+ cancel failed", err, { userId: user.id });
    return c.json({ error: "cancel_failed" }, 502);
  }
});

membershipRouter.post("/resume", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await resolveUser(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "no_account" }, 400);
  const m = await getMembership(sql, user.id);
  if (!m || !m.cancel_at_period_end) return c.json({ error: "nothing_to_resume" }, 404);
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  const subs = (await sql`
    SELECT stripe_subscription_id FROM sweepr_plus_memberships WHERE id = ${m.id} LIMIT 1
  `) as Array<{ stripe_subscription_id: string | null }>;
  const subId = subs[0]?.stripe_subscription_id;
  if (!subId) return c.json({ error: "no_subscription" }, 404);
  try {
    await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
    await sql`
      UPDATE sweepr_plus_memberships SET cancel_at_period_end = FALSE, updated_at = NOW()
      WHERE id = ${m.id}
    `;
    return c.json({ ok: true, cancelAtPeriodEnd: false });
  } catch (err) {
    logger.error("sweepr+ resume failed", err, { userId: user.id });
    return c.json({ error: "resume_failed" }, 502);
  }
});
