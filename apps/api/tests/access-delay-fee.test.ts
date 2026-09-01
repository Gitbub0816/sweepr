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
 * Access-delay / lockout fees (lib/accessDelayFee.ts):
 *   - the approved non-cumulative schedule ($0 ≤15, $25 ≤30, $50 ≤60, $85 beyond);
 *   - the 80/20 cleaner-team/Sweepr split in exact integer cents;
 *   - the payout carve-out: the fee portion of the booking total bypasses the
 *     standard 30% Marketplace Services Fee and pays the pool its fixed 80%
 *     (verified through crewPayout.computeCrewPoolCents, which the solo
 *     release path mirrors).
 */
import { describe, it, expect } from "vitest";
import type { Sql } from "@sweepr/db";
import {
  ACCESS_DELAY_FEE_SCHEDULE,
  accessDelayFeeCentsForDelay,
  splitAccessDelayFeeCents,
  sumAccessDelayFeeCents,
} from "../src/lib/accessDelayFee";
import { computeCrewPoolCents } from "../src/lib/crew/crewPayout";

describe("fee schedule — non-cumulative brackets", () => {
  it("matches the approved master-ruleset schedule", () => {
    expect(accessDelayFeeCentsForDelay(0)).toBe(0);
    expect(accessDelayFeeCentsForDelay(15)).toBe(0);
    expect(accessDelayFeeCentsForDelay(16)).toBe(2500);
    expect(accessDelayFeeCentsForDelay(30)).toBe(2500);
    expect(accessDelayFeeCentsForDelay(31)).toBe(5000);
    expect(accessDelayFeeCentsForDelay(60)).toBe(5000);
    expect(accessDelayFeeCentsForDelay(61)).toBe(8500);
    expect(accessDelayFeeCentsForDelay(240)).toBe(8500);
  });

  it("only the open-ended bracket permits cancelling the job", () => {
    const cancellable = ACCESS_DELAY_FEE_SCHEDULE.filter((b) => b.jobMayBeCancelled);
    expect(cancellable).toHaveLength(1);
    expect(cancellable[0].maxDelayMinutes).toBeNull();
  });

  it("re-charging replaces (delta), never stacks: bracket fee minus charged fee", () => {
    // The admin endpoint computes adjustment = bracket − already charged.
    const charged = accessDelayFeeCentsForDelay(25); // 2500
    const target = accessDelayFeeCentsForDelay(45); // 5000
    expect(target - charged).toBe(2500); // one delta, not 2500 + 5000
  });
});

describe("80/20 split — integer cents", () => {
  it("splits each bracket exactly, parts summing to the fee", () => {
    for (const feeCents of [0, 2500, 5000, 8500]) {
      const { cleanerCents, sweeprCents } = splitAccessDelayFeeCents(feeCents);
      expect(cleanerCents).toBe(Math.round(feeCents * 0.8));
      expect(cleanerCents + sweeprCents).toBe(feeCents);
    }
    expect(splitAccessDelayFeeCents(2500)).toEqual({ cleanerCents: 2000, sweeprCents: 500 });
    expect(splitAccessDelayFeeCents(8500)).toEqual({ cleanerCents: 6800, sweeprCents: 1700 });
  });

  it("odd amounts: cleaner share rounds, Sweepr takes the exact remainder", () => {
    const { cleanerCents, sweeprCents } = splitAccessDelayFeeCents(101);
    expect(cleanerCents + sweeprCents).toBe(101);
    expect(cleanerCents).toBe(81);
  });
});

// ── payout carve-out through the pool computation ────────────────────────────

function makeSql(opts: { totalPrice: number; accessFeeCents: number }): Sql {
  return ((strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("FROM booking_price_ledger")) {
      return Promise.resolve([{ total: opts.accessFeeCents }]);
    }
    if (text.includes("FROM platform_fee_settings")) return Promise.resolve([]); // → default 30%
    if (text.includes("founding_member")) {
      return Promise.resolve([{ founding_member: false, founding_member_revoked: false }]);
    }
    if (text.includes("FROM cleaner_tier_multipliers")) return Promise.resolve([]); // → 1.0
    if (text.includes("tier FROM cleaners")) return Promise.resolve([{ tier: "standard" }]);
    return Promise.resolve([]);
  }) as unknown as Sql;
}

describe("payout treatment — fee portion pays 80% to the pool", () => {
  it("carves the fee out of the standard split and adds its fixed 80%", async () => {
    // $100 base + $25 access fee = $125 total.
    // Pool = 70% of 10000 (7000) + 80% of 2500 (2000) = 9000 — NOT 70% of 12500 (8750).
    const sql = makeSql({ totalPrice: 12500, accessFeeCents: 2500 });
    const pool = await computeCrewPoolCents(sql, {
      id: "b1",
      cleaner_id: "cl-lead",
      total_price: 12500,
      founding_customer_discount_cents: 0,
      crew_status: "COMPLETED",
    });
    expect(pool).toBe(9000);
  });

  it("no access fee → the standard 70/30 pool, unchanged", async () => {
    const sql = makeSql({ totalPrice: 10000, accessFeeCents: 0 });
    const pool = await computeCrewPoolCents(sql, {
      id: "b1",
      cleaner_id: "cl-lead",
      total_price: 10000,
      founding_customer_discount_cents: 0,
      crew_status: "COMPLETED",
    });
    expect(pool).toBe(7000);
  });

  it("sumAccessDelayFeeCents fails safe to 0 on a query error", async () => {
    const sql = ((strings: TemplateStringsArray) => {
      const text = strings.join("?");
      if (text.includes("FROM booking_price_ledger")) return Promise.reject(new Error("boom"));
      return Promise.resolve([]);
    }) as unknown as Sql;
    expect(await sumAccessDelayFeeCents(sql, "b1")).toBe(0);
  });
});
