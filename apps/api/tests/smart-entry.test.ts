/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect } from "vitest";
import {
  isBenefitEligible,
  computeMembershipDiscountCents,
  type MembershipRow,
} from "../src/lib/sweeprPlus";
import { computeAccessWindow } from "../src/lib/smartEntry";
import { DEFAULT_SMART_ENTRY_CONFIG } from "../src/lib/smartEntryConfig";
import { redact } from "../src/lib/logger";

function mk(partial: Partial<MembershipRow>): MembershipRow {
  return {
    id: "m1",
    user_id: "u1",
    status: "active",
    cancel_at_period_end: false,
    current_period_end: null,
    grace_until: null,
    discount_cents_this_month: 0,
    discount_month_key: null,
    last_reschedule_waived_at: null,
    ...partial,
  };
}

describe("isBenefitEligible", () => {
  const now = new Date("2026-07-01T00:00:00Z");
  it("active/trialing are eligible", () => {
    expect(isBenefitEligible(mk({ status: "active" }), now)).toBe(true);
    expect(isBenefitEligible(mk({ status: "trialing" }), now)).toBe(true);
  });
  it("null / canceled / incomplete are not", () => {
    expect(isBenefitEligible(null, now)).toBe(false);
    expect(isBenefitEligible(mk({ status: "canceled" }), now)).toBe(false);
    expect(isBenefitEligible(mk({ status: "incomplete" }), now)).toBe(false);
  });
  it("past_due only within the grace window", () => {
    expect(
      isBenefitEligible(mk({ status: "past_due", grace_until: "2026-07-05T00:00:00Z" }), now),
    ).toBe(true);
    expect(
      isBenefitEligible(mk({ status: "past_due", grace_until: "2026-06-20T00:00:00Z" }), now),
    ).toBe(false);
    expect(isBenefitEligible(mk({ status: "past_due", grace_until: null }), now)).toBe(false);
  });
});

describe("computeMembershipDiscountCents", () => {
  const cfg = { plusDiscountPercent: 3, plusMonthlyDiscountCapCents: 1500 };
  const now = new Date("2026-07-10T00:00:00Z");

  it("is zero for non-members or zero subtotal", () => {
    expect(computeMembershipDiscountCents(null, 10000, cfg, now)).toBe(0);
    expect(computeMembershipDiscountCents(mk({}), 0, cfg, now)).toBe(0);
  });
  it("applies the percentage, floored", () => {
    // 3% of $100.00 = $3.00
    expect(computeMembershipDiscountCents(mk({}), 10000, cfg, now)).toBe(300);
    // 3% of $33.33 = 99.99c -> floored to 99
    expect(computeMembershipDiscountCents(mk({}), 3333, cfg, now)).toBe(99);
  });
  it("respects the monthly cap and resets across months", () => {
    // Already used $14.00 this month -> only $1.00 of headroom remains.
    const nearCap = mk({ discount_cents_this_month: 1400, discount_month_key: "2026-07" });
    expect(computeMembershipDiscountCents(nearCap, 10000, cfg, now)).toBe(100);
    // Counter belongs to a prior month -> full discount available again.
    const lastMonth = mk({ discount_cents_this_month: 1400, discount_month_key: "2026-06" });
    expect(computeMembershipDiscountCents(lastMonth, 10000, cfg, now)).toBe(300);
  });
});

describe("computeAccessWindow", () => {
  it("brackets the schedule by the configured offsets", () => {
    const scheduled = new Date("2026-07-10T15:00:00Z");
    const { startsAt, endsAt } = computeAccessWindow(scheduled, 120, DEFAULT_SMART_ENTRY_CONFIG);
    // 15 min before start
    expect(startsAt.toISOString()).toBe("2026-07-10T14:45:00.000Z");
    // 120 min job + 30 min after
    expect(endsAt.toISOString()).toBe("2026-07-10T17:30:00.000Z");
  });
});

describe("log redaction of access secrets", () => {
  it("never lets a working credential through", () => {
    const out = redact({
      bookingId: "b1",
      credential: "482193",
      access_code: "1234",
      door_code: "9999",
      note: "fine to keep",
    }) as Record<string, unknown>;
    expect(out.credential).toBe("[REDACTED]");
    expect(out.access_code).toBe("[REDACTED]");
    expect(out.door_code).toBe("[REDACTED]");
    expect(out.bookingId).toBe("b1");
    expect(out.note).toBe("fine to keep");
  });
});
