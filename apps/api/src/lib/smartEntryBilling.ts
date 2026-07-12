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
 * Smart Entry fee + Sweepr+ member discount — booking billing (spec §22, §4.2).
 *
 * Both are idempotent (claim-then-act on the dedicated booking columns) and
 * flow through the price ledger via applyBookingPriceAdjustment, keeping the
 * Stripe PaymentIntent in sync. Money is integer cents throughout.
 *
 *  - Smart Entry: +$5 add-on when the customer selected smart_entry and is NOT
 *    an eligible Sweepr+ member (members: $0, shown as a member benefit).
 *  - Sweepr+ discount: −(configured %) of the eligible cleaning subtotal, capped
 *    per calendar month; excludes tips/taxes/fees/etc (enforced by only ever
 *    discounting base_price here).
 */
import type Stripe from "stripe";
import type { Sql } from "./db";
import type { Env } from "../types";
import { applyBookingPriceAdjustment } from "./bookingLedger";
import { loadSmartEntryConfig } from "./smartEntryConfig";
import {
  getMembership,
  isBenefitEligible,
  computeMembershipDiscountCents,
  recordMembershipDiscount,
} from "./sweeprPlus";

/**
 * Apply the $5 Smart Entry add-on to a booking for a non-member. Idempotent:
 * the conditional UPDATE claims the row only if the fee hasn't been applied yet.
 * Returns the fee applied (0 for members / already-applied / disabled).
 */
export async function applySmartEntryFee(
  sql: Sql,
  stripe: Stripe,
  env: Env,
  bookingId: string,
  customerUserId: string,
): Promise<number> {
  const cfg = await loadSmartEntryConfig(sql);
  if (!cfg.smartEntryEnabled) return 0;
  const member = isBenefitEligible(await getMembership(sql, customerUserId));
  if (cfg.memberIncluded && member) return 0; // included with Sweepr+
  const fee = cfg.nonmemberFeeCents;
  if (fee <= 0) return 0;

  // Claim the fee slot so concurrent calls can't double-charge.
  const claimed = (await sql`
    UPDATE bookings SET smart_entry_fee_cents = ${fee}, updated_at = NOW()
    WHERE id = ${bookingId} AND smart_entry_fee_cents = 0
      AND access_method = 'smart_entry'
    RETURNING id
  `) as Array<{ id: string }>;
  if (!claimed[0]) return 0;

  try {
    await applyBookingPriceAdjustment(sql, stripe, {
      bookingId,
      adjustmentCents: fee,
      eventType: "smart_entry_fee",
      reason: "Sweepr Smart Entry",
      source: "system",
    });
  } catch (err) {
    // Roll back the claim so a later retry can re-apply cleanly.
    await sql`UPDATE bookings SET smart_entry_fee_cents = 0 WHERE id = ${bookingId}`;
    throw err;
  }
  return fee;
}

/**
 * Apply the Sweepr+ member discount to a booking's eligible cleaning subtotal.
 * Idempotent via the sweepr_plus_discount_cents column + monthly-cap accounting.
 * Returns the discount applied (negative adjustment magnitude, 0 if none).
 */
export async function applyMembershipDiscount(
  sql: Sql,
  stripe: Stripe,
  bookingId: string,
  customerUserId: string,
): Promise<number> {
  const cfg = await loadSmartEntryConfig(sql);
  if (!cfg.sweeprPlusEnabled) return 0;
  const m = await getMembership(sql, customerUserId);
  if (!isBenefitEligible(m)) return 0;

  const rows = (await sql`
    SELECT base_price, sweepr_plus_discount_cents FROM bookings WHERE id = ${bookingId} LIMIT 1
  `) as Array<{ base_price: number | null; sweepr_plus_discount_cents: number }>;
  const b = rows[0];
  if (!b || b.sweepr_plus_discount_cents > 0) return 0; // already applied

  const discount = computeMembershipDiscountCents(m, b.base_price ?? 0, cfg);
  if (discount <= 0) return 0;

  // Claim the discount slot.
  const claimed = (await sql`
    UPDATE bookings SET sweepr_plus_discount_cents = ${discount}, updated_at = NOW()
    WHERE id = ${bookingId} AND sweepr_plus_discount_cents = 0
    RETURNING id
  `) as Array<{ id: string }>;
  if (!claimed[0]) return 0;

  try {
    await applyBookingPriceAdjustment(sql, stripe, {
      bookingId,
      adjustmentCents: -discount,
      eventType: "membership_discount",
      reason: `Sweepr+ ${cfg.plusDiscountPercent}% member discount`,
      source: "system",
    });
    // Only count against the monthly cap once the ledger entry succeeds.
    await recordMembershipDiscount(sql, m!.id, discount);
  } catch (err) {
    await sql`UPDATE bookings SET sweepr_plus_discount_cents = 0 WHERE id = ${bookingId}`;
    throw err;
  }
  return discount;
}
