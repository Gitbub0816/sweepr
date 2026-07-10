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
 * Coupons engine.
 *
 * Coupons are the actual perks; promos are just the vehicles. They are silent
 * (no widget): they live on the person's account and APPLY AUTOMATICALLY to
 * the next qualifying booking — percent/amount discounts go through the
 * booking price ledger (hard convention #5), free add-ons attach as a 0¢
 * booking_addons row. Sign-up is required to hold one (email-bound coupons
 * from anonymous promo claims attach at first sign-in), and validity defaults
 * to 180 days per the Promotions & Coupons Terms.
 *
 * Sources: promo claims (reward payload on the promotion), milestone rules
 * ("100th customer", "2 years as a cleaner"), themed campaigns, or manual
 * admin grants. All grants funnel through grantCoupon.
 */

import type { Sql } from "./db";
import type Stripe from "stripe";
import { applyBookingPriceAdjustment, recordLedgerEntry } from "./bookingLedger";
import { logger } from "./logger";

// No 0/O/1/I — same unambiguous alphabet as reference ids.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function couponCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `SWPR-${out}`;
}

export interface CouponTemplate {
  kind: "percent_off" | "amount_off" | "free_addon";
  value?: number; // percent (1-100) or cents
  addonKey?: string;
  title?: string;
  description?: string;
  theme?: string;
  /** Days of validity — defaults to 180 (the legal maximum window). */
  validDays?: number;
  /** Minutes of validity for flash offers ("book in the next 15 minutes"). */
  offerMinutes?: number;
  maxRedemptions?: number;
  minBookingTotalCents?: number;
  /** May this coupon combine with other stackable coupons on one booking? */
  stackable?: boolean;
  /** Cap on total coupons in any stack this one joins (null = no cap). */
  maxStack?: number;
}

export interface GrantCouponInput {
  userId?: string | null;
  email?: string | null; // pre-signup binding (attached on first sign-in)
  template: CouponTemplate;
  source: "promo" | "milestone" | "theme" | "admin";
  sourceRef?: string | null;
  createdBy?: string | null;
}

export interface CouponRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  theme: string | null;
  kind: "percent_off" | "amount_off" | "free_addon";
  value: number;
  addon_key: string | null;
  user_id: string | null;
  email: string | null;
  max_redemptions: number;
  redemption_count: number;
  min_booking_total_cents: number | null;
  stackable: boolean;
  max_stack: number | null;
  starts_at: string;
  expires_at: string;
  status: string;
}

function defaultTitle(t: CouponTemplate): string {
  if (t.kind === "percent_off") return `${t.value ?? 0}% off your next booking`;
  if (t.kind === "amount_off") return `$${(((t.value ?? 0) / 100) as number).toFixed(2)} off your next booking`;
  return "Free add-on on your next booking";
}

/** Mint a coupon. Validity is clamped to the 180-day legal maximum. */
export async function grantCoupon(sql: Sql, input: GrantCouponInput): Promise<CouponRow | null> {
  const t = input.template;
  if (!t?.kind) return null;
  if (t.kind !== "free_addon" && !(typeof t.value === "number" && t.value > 0)) return null;
  if (t.kind === "free_addon" && !t.addonKey) return null;
  if (!input.userId && !input.email) return null;

  const validDays = Math.min(Math.max(t.validDays ?? 180, 1), 180);
  const expiresAt = t.offerMinutes
    ? new Date(Date.now() + Math.min(Math.max(t.offerMinutes, 1), 24 * 60) * 60_000)
    : new Date(Date.now() + validDays * 86_400_000);

  try {
    const rows = (await sql`
      INSERT INTO coupons (
        code, title, description, theme, kind, value, addon_key,
        user_id, email, source, source_ref, max_redemptions,
        min_booking_total_cents, stackable, max_stack, expires_at, created_by
      ) VALUES (
        ${couponCode()}, ${t.title ?? defaultTitle(t)}, ${t.description ?? null},
        ${t.theme ?? null}, ${t.kind}, ${t.value ?? 0}, ${t.addonKey ?? null},
        ${input.userId ?? null}, ${input.email?.toLowerCase() ?? null},
        ${input.source}, ${input.sourceRef ?? null},
        ${Math.max(t.maxRedemptions ?? 1, 1)},
        ${t.minBookingTotalCents ?? null},
        ${t.stackable ?? false}, ${t.maxStack ?? null},
        ${expiresAt.toISOString()},
        ${input.createdBy ?? null}
      )
      RETURNING *
    `) as CouponRow[];
    return rows[0] ?? null;
  } catch {
    // STRICT lock: the DB unique index (source, source_ref, identity) rejects
    // a second coupon from the same promo/milestone for the same person.
    return null;
  }
}

/**
 * Attach email-bound coupons to the account that just authenticated with that
 * email (sign-up is required to actually hold/spend a coupon). Idempotent.
 */
export async function attachPendingCouponsByEmail(
  sql: Sql,
  userId: string,
  email: string | null | undefined,
): Promise<number> {
  if (!email) return 0;
  const pending = (await sql`
    SELECT id FROM coupons
    WHERE user_id IS NULL AND status = 'active' AND LOWER(email) = LOWER(${email})
  `) as Array<{ id: string }>;
  let attached = 0;
  for (const row of pending) {
    try {
      await sql`UPDATE coupons SET user_id = ${userId} WHERE id = ${row.id} AND user_id IS NULL`;
      attached++;
    } catch {
      // The strict one-per-identity index rejected the attach: this account
      // already holds a coupon from the same promo/milestone. The email-bound
      // duplicate is dead weight — revoke it so it stops matching.
      await sql`UPDATE coupons SET status = 'revoked' WHERE id = ${row.id} AND user_id IS NULL`.catch(
        () => {},
      );
    }
  }
  return attached;
}

/** All currently-usable coupons on an account (for the account UI). */
export async function activeCouponsForUser(sql: Sql, userId: string): Promise<CouponRow[]> {
  return (await sql`
    SELECT * FROM coupons
    WHERE user_id = ${userId} AND status = 'active'
      AND starts_at <= NOW() AND expires_at > NOW()
      AND redemption_count < max_redemptions
    ORDER BY expires_at ASC
  `) as CouponRow[];
}

export interface AppliedCoupon {
  couponId: string;
  code: string;
  title: string;
  kind: CouponRow["kind"];
  amountAppliedCents: number;
  addonKey: string | null;
}

/**
 * Auto-apply the customer's best coupon SET to a freshly created booking.
 *
 * Stacking rules (per-coupon permissions):
 *   - non-stackable coupons apply ALONE;
 *   - stackable coupons may combine with other stackables, capped by every
 *     participant's max_stack (the tightest cap in the set wins);
 *   - the engine compares the best single non-stackable against the best legal
 *     stack and applies whichever saves the customer more.
 *
 * Each application: use-spend is claimed FIRST via a conditional UPDATE (no
 * concurrent double-spend), discounts flow through the price ledger, free
 * add-ons attach as 0¢ booking_addons rows, and every coupon×booking pair is
 * recorded once (UNIQUE coupon_id+booking_id). Best-effort by design.
 */
export async function autoApplyBestCoupon(
  sql: Sql,
  stripe: Stripe,
  args: { bookingId: string; userId: string; totalCents: number },
): Promise<AppliedCoupon | null> {
  try {
    const candidates = await activeCouponsForUser(sql, args.userId);
    const scored = candidates
      .filter((c) => (c.min_booking_total_cents ?? 0) <= args.totalCents)
      .map((c) => ({
        c,
        cents:
          c.kind === "percent_off"
            ? Math.round((args.totalCents * c.value) / 100)
            : c.kind === "amount_off"
              ? Math.min(c.value, args.totalCents)
              : 0,
      }))
      .sort((a, b) => b.cents - a.cents);
    if (scored.length === 0) return null;

    // Best single (any coupon may apply alone).
    const bestSingle = scored[0];

    // Best legal stack: greedy by value over stackable coupons, honoring the
    // tightest max_stack among the chosen set at every step.
    const stackables = scored.filter((s) => s.c.stackable);
    const stack: typeof scored = [];
    for (const s of stackables) {
      const capOfSet = Math.min(
        ...stack.map((x) => x.c.max_stack ?? Infinity),
        s.c.max_stack ?? Infinity,
      );
      if (stack.length + 1 > capOfSet) continue;
      stack.push(s);
    }
    const stackValue = stack.reduce((a, s) => a + s.cents, 0);

    const chosen = stack.length >= 2 && stackValue > bestSingle.cents ? stack : [bestSingle];

    let remaining = args.totalCents;
    const applied: AppliedCoupon[] = [];

    for (const pick of chosen) {
      const coupon = pick.c;
      // Claim a use (atomic — blocks concurrent double-spend across bookings).
      const claimed = (await sql`
        UPDATE coupons
        SET redemption_count = redemption_count + 1,
            status = CASE WHEN redemption_count + 1 >= max_redemptions THEN 'exhausted' ELSE status END
        WHERE id = ${coupon.id} AND status = 'active'
          AND redemption_count < max_redemptions AND expires_at > NOW()
        RETURNING id
      `) as Array<{ id: string }>;
      if (!claimed[0]) continue;

      let amountApplied = 0;
      try {
        if (coupon.kind === "free_addon" && coupon.addon_key) {
          await sql`
            INSERT INTO booking_addons (booking_id, addon_key, addon_name, price)
            VALUES (${args.bookingId}, ${coupon.addon_key}, ${`${coupon.addon_key} (coupon)`}, 0)
            ON CONFLICT DO NOTHING
          `;
          await recordLedgerEntry(sql, {
            bookingId: args.bookingId,
            eventType: "coupon_discount",
            previousTotalCents: remaining,
            adjustmentCents: 0,
            newTotalCents: remaining,
            reason: `Coupon ${coupon.code}: free add-on ${coupon.addon_key}`,
            source: "system",
          });
        } else {
          // Clamp so a stack can never push the booking below zero.
          amountApplied = Math.min(pick.cents, remaining);
          if (amountApplied > 0) {
            await applyBookingPriceAdjustment(sql, stripe, {
              bookingId: args.bookingId,
              adjustmentCents: -amountApplied,
              eventType: "coupon_discount",
              reason: `Coupon ${coupon.code}: ${coupon.title}`,
              source: "system",
            });
            remaining -= amountApplied;
          }
        }

        await sql`
          INSERT INTO coupon_redemptions (coupon_id, booking_id, user_id, amount_applied_cents, addon_key)
          VALUES (${coupon.id}, ${args.bookingId}, ${args.userId}, ${amountApplied}, ${coupon.addon_key})
        `;
        applied.push({
          couponId: coupon.id,
          code: coupon.code,
          title: coupon.title,
          kind: coupon.kind,
          amountAppliedCents: amountApplied,
          addonKey: coupon.addon_key,
        });
      } catch (err) {
        // Roll the claimed use back so the coupon isn't burned by a failure.
        await sql`
          UPDATE coupons SET redemption_count = GREATEST(redemption_count - 1, 0),
                             status = 'active'
          WHERE id = ${coupon.id} AND status IN ('active', 'exhausted')
        `.catch(() => {});
        logger.error("coupon.apply_one failed", err, { bookingId: args.bookingId, coupon: coupon.code });
      }
    }

    if (applied.length === 0) return null;
    // Summary result (first = most valuable): totals include the whole stack.
    return {
      ...applied[0],
      amountAppliedCents: applied.reduce((a, x) => a + x.amountAppliedCents, 0),
      code: applied.map((x) => x.code).join(" + "),
    };
  } catch (err) {
    logger.error("coupon.auto_apply failed", err, { bookingId: args.bookingId });
    return null;
  }
}

/** Cron sweep: flip past-deadline active coupons to expired. */
export async function expireDueCoupons(sql: Sql): Promise<number> {
  const rows = (await sql`
    UPDATE coupons SET status = 'expired'
    WHERE status = 'active' AND expires_at <= NOW()
    RETURNING id
  `) as Array<{ id: string }>;
  return rows.length;
}

// ─── Milestones ──────────────────────────────────────────────────────────────

interface MilestoneRule {
  rule_key: string;
  label: string;
  kind: string;
  threshold: number;
  coupon: CouponTemplate;
}

/**
 * Evaluate active milestone rules and mint coupons for newly-hit subjects.
 * Idempotent: milestone_awards(rule_key, subject_id) is UNIQUE, and the award
 * row is inserted BEFORE the coupon so a cron race can't double-grant.
 */
export async function evaluateMilestones(sql: Sql): Promise<number> {
  const rules = (await sql`
    SELECT rule_key, label, kind, threshold, coupon FROM milestone_rules WHERE active = TRUE
  `) as MilestoneRule[];
  let granted = 0;

  for (const rule of rules) {
    try {
      let subjects: Array<{ subject_id: string; user_id: string | null; subject_type: string }> = [];

      if (rule.kind === "nth_customer") {
        subjects = (await sql`
          SELECT cu.id AS subject_id, cu.user_id, 'customer' AS subject_type
          FROM customers cu
          ORDER BY cu.created_at ASC OFFSET ${rule.threshold - 1} LIMIT 1
        `) as typeof subjects;
      } else if (rule.kind === "nth_cleaner") {
        subjects = (await sql`
          SELECT cl.id AS subject_id, cl.user_id, 'cleaner' AS subject_type
          FROM cleaners cl WHERE cl.status = 'approved'
          ORDER BY cl.created_at ASC OFFSET ${rule.threshold - 1} LIMIT 1
        `) as typeof subjects;
      } else if (rule.kind === "nth_completed_booking") {
        subjects = (await sql`
          SELECT b.id AS subject_id, cu.user_id, 'booking' AS subject_type
          FROM bookings b JOIN customers cu ON cu.id = b.customer_id
          WHERE b.status = 'completed'
          ORDER BY b.updated_at ASC OFFSET ${rule.threshold - 1} LIMIT 1
        `) as typeof subjects;
      } else if (rule.kind === "cleaner_anniversary_years") {
        subjects = (await sql`
          SELECT cl.id AS subject_id, cl.user_id, 'cleaner' AS subject_type
          FROM cleaners cl
          WHERE cl.status = 'approved'
            AND cl.created_at <= NOW() - (${rule.threshold} * INTERVAL '1 year')
            AND NOT EXISTS (SELECT 1 FROM milestone_awards ma
                            WHERE ma.rule_key = ${rule.rule_key} AND ma.subject_id = cl.id)
          LIMIT 50
        `) as typeof subjects;
      } else if (rule.kind === "customer_anniversary_years") {
        subjects = (await sql`
          SELECT cu.id AS subject_id, cu.user_id, 'customer' AS subject_type
          FROM customers cu
          WHERE cu.created_at <= NOW() - (${rule.threshold} * INTERVAL '1 year')
            AND NOT EXISTS (SELECT 1 FROM milestone_awards ma
                            WHERE ma.rule_key = ${rule.rule_key} AND ma.subject_id = cu.id)
          LIMIT 50
        `) as typeof subjects;
      }

      for (const s of subjects) {
        if (!s.user_id) continue;
        // Claim the award slot first — UNIQUE(rule_key, subject_id) makes a
        // concurrent tick lose cleanly.
        const award = (await sql`
          INSERT INTO milestone_awards (rule_key, subject_type, subject_id)
          VALUES (${rule.rule_key}, ${s.subject_type}, ${s.subject_id})
          ON CONFLICT (rule_key, subject_id) DO NOTHING
          RETURNING id
        `) as Array<{ id: string }>;
        if (!award[0]) continue;

        const coupon = await grantCoupon(sql, {
          userId: s.user_id,
          template: { title: rule.label, ...rule.coupon },
          source: "milestone",
          sourceRef: rule.rule_key,
        });
        if (coupon) {
          await sql`UPDATE milestone_awards SET coupon_id = ${coupon.id} WHERE id = ${award[0].id}`;
          granted++;
        }
      }
    } catch (err) {
      logger.error("milestone.evaluate failed", err, { rule: rule.rule_key });
    }
  }
  return granted;
}
