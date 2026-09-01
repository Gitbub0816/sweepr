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
 * Access-delay / lockout fees (master ruleset extendedRules.accessDelayAndLockout).
 *
 * When the cleaner (or crew) arrives on time but cannot get in, the customer
 * owes a NON-CUMULATIVE fee based on how long access was delayed:
 *
 *   0–15 min   → $0
 *   16–30 min  → $25
 *   31–60 min  → $50
 *   61+ min    → $85 (and the job may be cancelled)
 *
 * Non-cumulative means the schedule REPLACES: a booking only ever carries the
 * single fee for its final delay bracket, never a running total. Charges flow
 * through the booking price ledger (event_type 'access_delay_fee', conv. 5),
 * so re-charging a longer delay records only the DELTA to the bracket fee and
 * the ledger's running total stays authoritative.
 *
 * ALLOCATION (owner ruleset): 80% to the cleaner team / 20% to Sweepr — NOT
 * the standard 70/30 Marketplace Services Fee split. At payout time the fee
 * portion of the booking total is carved out, the normal payout math runs on
 * the remainder, and 80% of the fee is added to the cleaner pool (tier /
 * founding multipliers deliberately do NOT apply to the fee portion — the
 * 80/20 allocation is fixed by the ruleset). For a crew, the 80% joins the
 * pool and splits by the configured crew fractions.
 */

import type { Sql } from "./db";

export interface AccessDelayFeeBracket {
  /** Inclusive upper bound of the bracket in minutes; null = open-ended. */
  maxDelayMinutes: number | null;
  feeCents: number;
  /** The open-ended bracket also permits cancelling the job. */
  jobMayBeCancelled?: boolean;
}

/** The approved fee schedule (mirrors the master ruleset; non-cumulative). */
export const ACCESS_DELAY_FEE_SCHEDULE: AccessDelayFeeBracket[] = [
  { maxDelayMinutes: 15, feeCents: 0 },
  { maxDelayMinutes: 30, feeCents: 2500 },
  { maxDelayMinutes: 60, feeCents: 5000 },
  { maxDelayMinutes: null, feeCents: 8500, jobMayBeCancelled: true },
];

/** Cleaner-team share of an access-delay fee, in percent. */
export const ACCESS_DELAY_CLEANER_SHARE_PCT = 80;

/** The single (non-cumulative) fee owed for a total access delay in minutes. */
export function accessDelayFeeCentsForDelay(delayMinutes: number): number {
  const mins = Math.max(0, Math.floor(delayMinutes));
  for (const bracket of ACCESS_DELAY_FEE_SCHEDULE) {
    if (bracket.maxDelayMinutes == null || mins <= bracket.maxDelayMinutes) {
      return bracket.feeCents;
    }
  }
  return 0;
}

/**
 * Split an access-delay fee 80/20 (cleaner team / Sweepr) in integer cents.
 * The cleaner share is rounded; Sweepr takes the exact remainder, so the two
 * parts always sum to the fee.
 */
export function splitAccessDelayFeeCents(feeCents: number): {
  cleanerCents: number;
  sweeprCents: number;
} {
  const fee = Math.max(0, Math.round(feeCents));
  const cleanerCents = Math.round((fee * ACCESS_DELAY_CLEANER_SHARE_PCT) / 100);
  return { cleanerCents, sweeprCents: fee - cleanerCents };
}

/**
 * Total access-delay fee currently charged on a booking: the SUM of its
 * 'access_delay_fee' ledger entries. Because charges are recorded as deltas to
 * the (non-cumulative) bracket fee, the sum IS the single current fee.
 * Returns 0 on any error — payout math then treats the booking as fee-free,
 * which under-pays nobody below the standard split.
 */
export async function sumAccessDelayFeeCents(sql: Sql, bookingId: string): Promise<number> {
  try {
    const rows = (await sql`
      SELECT COALESCE(SUM(adjustment_cents), 0)::int AS total
      FROM booking_price_ledger
      WHERE booking_id = ${bookingId} AND event_type = 'access_delay_fee'
    `) as Array<{ total: number }>;
    return Math.max(0, Number(rows[0]?.total ?? 0));
  } catch {
    return 0;
  }
}
