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
 * Sweepr+ membership benefit resolution (spec §4–§5, §22).
 *
 * Benefits are ONLY active when Stripe reports the subscription active/trialing,
 * or past_due within its grace window. Membership state is written by the
 * Stripe webhook (lib/stripeSubscriptions.ts); this module reads it and applies
 * benefits deterministically and server-side.
 */
import type { Sql } from "./db";
import { loadSmartEntryConfig } from "./smartEntryConfig";

export interface MembershipRow {
  id: string;
  user_id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  grace_until: string | null;
  discount_cents_this_month: number;
  discount_month_key: string | null;
  last_reschedule_waived_at: string | null;
}

/** The single live/most-recent membership row for a user (may be null). */
export async function getMembership(sql: Sql, userId: string): Promise<MembershipRow | null> {
  const rows = (await sql`
    SELECT id, user_id, status, cancel_at_period_end, current_period_end,
           grace_until, discount_cents_this_month, discount_month_key,
           last_reschedule_waived_at
    FROM sweepr_plus_memberships
    WHERE user_id = ${userId}
    ORDER BY (status IN ('trialing','active','past_due')) DESC, updated_at DESC
    LIMIT 1
  `) as MembershipRow[];
  return rows[0] ?? null;
}

/** True when the membership currently confers benefits. */
export function isBenefitEligible(m: MembershipRow | null, now = new Date()): boolean {
  if (!m) return false;
  if (m.status === "active" || m.status === "trialing") return true;
  // past_due keeps benefits only inside the grace window.
  if (m.status === "past_due" && m.grace_until) {
    return now.getTime() <= new Date(m.grace_until).getTime();
  }
  return false;
}

export async function isMember(sql: Sql, userId: string): Promise<boolean> {
  return isBenefitEligible(await getMembership(sql, userId));
}

const monthKey = (d = new Date()) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * Compute the Sweepr+ percentage discount on an eligible service subtotal,
 * honoring the rolling monthly cap. Pure calculation — does NOT persist. Call
 * `recordMembershipDiscount` when the discount is actually applied to a booking.
 *
 * `eligibleSubtotalCents` must already EXCLUDE tips, taxes, background/identity
 * charges, Smart Entry fees, damage/mess/cancellation fees, third-party rental
 * charges, gift cards, and promo-credit purchases (spec §4.2).
 */
export function computeMembershipDiscountCents(
  m: MembershipRow | null,
  eligibleSubtotalCents: number,
  cfg: { plusDiscountPercent: number; plusMonthlyDiscountCapCents: number },
  now = new Date(),
): number {
  if (!isBenefitEligible(m, now) || eligibleSubtotalCents <= 0) return 0;
  const raw = Math.floor((eligibleSubtotalCents * cfg.plusDiscountPercent) / 100);
  // Reset the rolling counter when the month rolls over.
  const usedThisMonth =
    m!.discount_month_key === monthKey(now) ? m!.discount_cents_this_month : 0;
  const remainingCap = Math.max(0, cfg.plusMonthlyDiscountCapCents - usedThisMonth);
  return Math.max(0, Math.min(raw, remainingCap));
}

/** Persist an applied member discount against the rolling monthly cap. */
export async function recordMembershipDiscount(
  sql: Sql,
  membershipId: string,
  discountCents: number,
  now = new Date(),
): Promise<void> {
  if (discountCents <= 0) return;
  const key = monthKey(now);
  await sql`
    UPDATE sweepr_plus_memberships
    SET discount_cents_this_month =
          CASE WHEN discount_month_key = ${key}
               THEN discount_cents_this_month + ${discountCents}
               ELSE ${discountCents} END,
        discount_month_key = ${key},
        updated_at = NOW()
    WHERE id = ${membershipId}
  `;
}

/**
 * Resolve the Smart Entry fee for a booking: $0 for eligible members, else the
 * configured non-member fee. Returns cents.
 */
export async function smartEntryFeeCents(sql: Sql, userId: string): Promise<number> {
  const cfg = await loadSmartEntryConfig(sql);
  if (cfg.memberIncluded && (await isMember(sql, userId))) return 0;
  return cfg.nonmemberFeeCents;
}

/**
 * Try to consume the "one waived late-reschedule fee / 90 days" benefit.
 * Returns true and stamps the usage if available; false otherwise. Claim-then-
 * act: the conditional UPDATE guarantees only one waiver per 90-day window.
 */
export async function tryConsumeRescheduleWaiver(
  sql: Sql,
  membershipId: string,
  now = new Date(),
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const rows = (await sql`
    UPDATE sweepr_plus_memberships
    SET last_reschedule_waived_at = ${now.toISOString()}, updated_at = NOW()
    WHERE id = ${membershipId}
      AND status IN ('active','trialing')
      AND (last_reschedule_waived_at IS NULL OR last_reschedule_waived_at < ${cutoff})
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
}
