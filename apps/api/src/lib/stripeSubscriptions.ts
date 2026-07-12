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
 * Sweepr+ membership ↔ Stripe Subscription synchronization (spec §5).
 *
 * The Stripe webhook is the single source of truth for membership status:
 * benefits activate only when Stripe reports active/trialing (never on a bare
 * authorization). A failed renewal → past_due + a configurable grace window;
 * cancellation keeps benefits through the paid period. Physical home access is
 * NEVER interrupted by a renewal failure — that concern lives in homeAccess.ts,
 * which gates on the booking, not the membership.
 */
import type Stripe from "stripe";
import type { Sql } from "./db";
import { loadSmartEntryConfig } from "./smartEntryConfig";

/** Our subscriptions carry this metadata marker to distinguish them from the
 *  recurring-cleaning `subscriptions` table (which is unrelated). */
export const SWEEPR_PLUS_META = "sweepr_plus";

function periodEnd_to_iso(unix: number | null): string | null {
  return unix ? new Date(unix * 1000).toISOString() : null;
}

function intervalOf(sub: Stripe.Subscription): "month" | "year" | null {
  const iv = sub.items.data[0]?.price?.recurring?.interval;
  return iv === "month" || iv === "year" ? iv : null;
}

/**
 * Upsert the membership row from a Stripe Subscription object. Resolves the
 * owning user via subscription metadata.user_id (set at checkout). Idempotent.
 */
export async function syncSweeprPlusSubscription(
  sql: Sql,
  sub: Stripe.Subscription,
): Promise<void> {
  if (sub.metadata?.type !== SWEEPR_PLUS_META) return; // not ours
  const userId = sub.metadata?.user_id;
  if (!userId) return;

  const cfg = await loadSmartEntryConfig(sql);
  const status = sub.status; // Stripe status string maps 1:1 to our CHECK set
  // In the pinned API version current_period_end lives on the subscription item.
  const periodEndUnix = sub.items.data[0]?.current_period_end ?? null;
  const periodEnd = periodEnd_to_iso(periodEndUnix);
  const graceUntil =
    status === "past_due"
      ? new Date(Date.now() + cfg.plusGraceDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;

  await sql`
    INSERT INTO sweepr_plus_memberships (
      user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
      interval, status, cancel_at_period_end, current_period_end, grace_until,
      updated_at
    ) VALUES (
      ${userId}, ${customerId}, ${sub.id}, ${priceId},
      ${intervalOf(sub)}, ${status}, ${sub.cancel_at_period_end},
      ${periodEnd}, ${graceUntil}, NOW()
    )
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      stripe_customer_id   = EXCLUDED.stripe_customer_id,
      stripe_price_id      = EXCLUDED.stripe_price_id,
      interval             = EXCLUDED.interval,
      status               = EXCLUDED.status,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      current_period_end   = EXCLUDED.current_period_end,
      -- Preserve an existing grace deadline once set; only (re)stamp on new past_due.
      grace_until          = CASE
        WHEN EXCLUDED.status = 'past_due'
          THEN COALESCE(sweepr_plus_memberships.grace_until, EXCLUDED.grace_until)
        ELSE NULL END,
      updated_at           = NOW()
  `;
}

/** Mark a membership canceled (subscription.deleted). Benefits already lapse
 *  because status flips out of the eligible set. */
export async function markMembershipCanceled(sql: Sql, stripeSubscriptionId: string): Promise<void> {
  await sql`
    UPDATE sweepr_plus_memberships
    SET status = 'canceled', cancel_at_period_end = FALSE, grace_until = NULL, updated_at = NOW()
    WHERE stripe_subscription_id = ${stripeSubscriptionId}
  `;
}
