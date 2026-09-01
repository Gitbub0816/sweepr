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
 * Booking-calendar date rules (migration 106) — domain-rule tests for
 * lib/calendarRules.ts + lib/localDate.ts.
 *
 * Covers: local-date matching across UTC-offset edge cases (evening bookings
 * near midnight), block detection for create/reschedule enforcement,
 * area-specific vs platform-wide precedence, percent and flat adjustment math
 * including negatives + the engine-minimum interaction, coupon auto-apply
 * competition (a better held coupon wins; nothing stacks twice), bulk date
 * expansion with weekday filtering, the public availability shape (labels
 * only, no internal reasons), and that the admin CRUD router rejects
 * unauthenticated calls.
 */

import { describe, it, expect } from "vitest";
import type { Sql } from "../src/lib/db";
import {
  localBookingDate,
  deriveOffsetFromWindow,
  computeArrivalInstant,
} from "../src/lib/localDate";
import {
  pickEffectiveRules,
  computeDateAdjustmentCents,
  expandRuleDates,
  getEffectiveDateRules,
  grantDateRuleCoupon,
  publicAvailability,
  BLOCKED_DATE_MESSAGE,
  type CalendarRuleRow,
} from "../src/lib/calendarRules";
import { autoApplyBestCoupon } from "../src/lib/coupons";
import { adminCalendarRouter } from "../src/routes/adminCalendar";

// ── Template-tag SQL mock (same approach as reports/crew tests) ──────────────
type Row = Record<string, unknown>;
type Handler = (query: string, params: unknown[]) => Row[];

function makeSql(handler: Handler): Sql {
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    return handler(text, values);
  }) as unknown as Sql;
}

const AREA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AREA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";

let ruleSeq = 0;
function rule(over: Partial<CalendarRuleRow> = {}): CalendarRuleRow {
  ruleSeq++;
  return {
    id: `00000000-0000-4000-8000-${String(ruleSeq).padStart(12, "0")}`,
    rule_date: "2026-12-26",
    service_area_id: null,
    kind: "block",
    adjustment_type: null,
    adjustment_value: null,
    coupon_kind: null,
    coupon_value: null,
    label: "Unavailable",
    reason: null,
    active: true,
    created_by: "user_admin",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...over,
  };
}

// ── Local-date matching (evening bookings near midnight) ─────────────────────

describe("localBookingDate", () => {
  it("keeps an evening PST booking on the customer's calendar date", () => {
    // Dec 26, 9pm PST (-480) is Dec 27 05:00Z — the UTC date is WRONG.
    expect(localBookingDate("2026-12-27T05:00:00.000Z", -480)).toBe("2026-12-26");
  });

  it("rolls forward for an early-morning date east of UTC", () => {
    // Dec 26 15:30Z at +540 (JST) is already Dec 27, 00:30 local.
    expect(localBookingDate("2026-12-26T15:30:00.000Z", 540)).toBe("2026-12-27");
  });

  it("reads an offset embedded in the scheduledAt string", () => {
    // 9pm EST on Dec 26, sent with its own offset.
    expect(localBookingDate("2026-12-26T21:00:00-05:00")).toBe("2026-12-26");
  });

  it("prefers the explicit client offset over the embedded one", () => {
    expect(localBookingDate("2026-12-26T21:00:00-05:00", 540)).toBe("2026-12-27");
  });

  it("recovers the offset from the arrival window for stored bookings", () => {
    // Stored instant Dec 27 05:00Z with a 21:00 window start → offset -480 →
    // the booking's real local date is Dec 26.
    expect(localBookingDate("2026-12-27T05:00:00.000Z", null, "21:00")).toBe("2026-12-26");
    expect(deriveOffsetFromWindow("2026-12-27T05:00:00.000Z", "21:00")).toBe(-480);
  });

  it("falls back to the UTC date when no timezone information exists", () => {
    expect(localBookingDate("2026-12-27T05:00:00.000Z")).toBe("2026-12-27");
    expect(deriveOffsetFromWindow("2026-12-27T05:00:00.000Z", null)).toBeNull();
    expect(deriveOffsetFromWindow("2026-12-27T05:00:00.000Z", "not-a-time")).toBeNull();
  });

  it("round-trips through computeArrivalInstant (create → stored → derived)", () => {
    // Client: evening slot near midnight, negative offset.
    const instant = computeArrivalInstant("2026-12-27T05:00:00.000Z", "22:00", -480);
    // Arrival instant = Dec 26, 22:00 at -08:00 → Dec 27 06:00Z.
    expect(instant).toBe("2026-12-27T06:00:00.000Z");
    // The stored booking (instant + window) resolves back to the picked date.
    expect(localBookingDate(instant, null, "22:00")).toBe("2026-12-26");
  });

  it("handles half-hour offsets", () => {
    // 23:00 at +05:30 (India) on Dec 26 → Dec 26 17:30Z.
    expect(localBookingDate("2026-12-26T17:30:00.000Z", 330)).toBe("2026-12-26");
    expect(deriveOffsetFromWindow("2026-12-26T17:30:00.000Z", "23:00")).toBe(330);
  });
});

// ── Precedence: area-specific vs platform-wide ───────────────────────────────

describe("pickEffectiveRules", () => {
  const platformAdj = rule({
    kind: "price_adjustment",
    adjustment_type: "percent",
    adjustment_value: 10,
    label: "Holiday pricing",
  });
  const areaAdj = rule({
    kind: "price_adjustment",
    adjustment_type: "flat",
    adjustment_value: 2500,
    service_area_id: AREA_A,
    label: "Bay Area holiday pricing",
  });

  it("lets an area-specific adjustment OVERRIDE the platform-wide one (no stacking)", () => {
    const eff = pickEffectiveRules([platformAdj, areaAdj], AREA_A);
    expect(eff.adjustment?.id).toBe(areaAdj.id);
    expect(eff.blocked).toBe(false);
  });

  it("applies the platform-wide rule when the booking is in another area", () => {
    const eff = pickEffectiveRules([platformAdj], AREA_B);
    expect(eff.adjustment?.id).toBe(platformAdj.id);
  });

  it("never applies an area rule outside its area (unresolvable address = platform only)", () => {
    const eff = pickEffectiveRules([areaAdj], null);
    expect(eff.adjustment).toBeNull();
  });

  it("blocks on EITHER a platform-wide or an area block (union semantics)", () => {
    const platformBlock = rule({ kind: "block" });
    const areaBlock = rule({ kind: "block", service_area_id: AREA_A });
    expect(pickEffectiveRules([platformBlock], AREA_A).blocked).toBe(true);
    expect(pickEffectiveRules([areaBlock], AREA_A).blocked).toBe(true);
    expect(pickEffectiveRules([areaBlock], null).blocked).toBe(false);
  });

  it("ignores inactive rules entirely", () => {
    const eff = pickEffectiveRules(
      [rule({ active: false }), { ...platformAdj, active: false }],
      null,
    );
    expect(eff.blocked).toBe(false);
    expect(eff.adjustment).toBeNull();
  });

  it("resolves coupons with the same override precedence", () => {
    const platformCoupon = rule({ kind: "coupon", coupon_kind: "percent_off", coupon_value: 10 });
    const areaCoupon = rule({
      kind: "coupon",
      coupon_kind: "amount_off",
      coupon_value: 2000,
      service_area_id: AREA_A,
    });
    expect(pickEffectiveRules([platformCoupon, areaCoupon], AREA_A).coupon?.id).toBe(areaCoupon.id);
    expect(pickEffectiveRules([platformCoupon, areaCoupon], AREA_B).coupon?.id).toBe(
      platformCoupon.id,
    );
  });
});

// ── Adjustment math (percent, flat, negative, minimum interaction) ───────────

describe("computeDateAdjustmentCents", () => {
  it("computes whole-percent adjustments on the pre-tax subtotal", () => {
    expect(
      computeDateAdjustmentCents({ adjustment_type: "percent", adjustment_value: 10 }, 20_000),
    ).toBe(2_000);
    expect(
      computeDateAdjustmentCents({ adjustment_type: "percent", adjustment_value: 12 }, 9_999),
    ).toBe(1_200); // Math.round(1199.88)
  });

  it("supports negative percents (discounts)", () => {
    expect(
      computeDateAdjustmentCents({ adjustment_type: "percent", adjustment_value: -15 }, 20_000),
    ).toBe(-3_000);
  });

  it("passes flat cents through, positive and negative", () => {
    expect(
      computeDateAdjustmentCents({ adjustment_type: "flat", adjustment_value: 2_500 }, 20_000),
    ).toBe(2_500);
    expect(
      computeDateAdjustmentCents({ adjustment_type: "flat", adjustment_value: -2_500 }, 20_000),
    ).toBe(-2_500);
  });

  it("clamps a discount so the subtotal can never go below zero", () => {
    expect(
      computeDateAdjustmentCents({ adjustment_type: "flat", adjustment_value: -50_000 }, 20_000),
    ).toBe(-20_000);
    expect(
      computeDateAdjustmentCents({ adjustment_type: "flat", adjustment_value: -1 }, 0),
    ).toBe(0);
  });

  it("applies AFTER an engine minimum: the percent runs on the floored subtotal", () => {
    // A v2 quote whose raw labor priced below the version's minimumBookingCents
    // reaches the date layer already floored (the adjustment base in
    // computeBookingPricing is the engine's customer total minus tax). 10% of
    // the $120 floor — not of the smaller raw price.
    const flooredPreTaxSubtotal = 12_000;
    expect(
      computeDateAdjustmentCents(
        { adjustment_type: "percent", adjustment_value: 10 },
        flooredPreTaxSubtotal,
      ),
    ).toBe(1_200);
  });
});

// ── Block detection (create + reschedule enforcement path) ───────────────────

describe("getEffectiveDateRules (block enforcement)", () => {
  function rulesSql(rows: CalendarRuleRow[], seen: { params?: unknown[] } = {}): Sql {
    return makeSql((q, params) => {
      if (q.includes("FROM calendar_date_rules")) {
        seen.params = params;
        return rows as unknown as Row[];
      }
      throw new Error(`unexpected query: ${q}`);
    });
  }

  it("flags a blocked local date (what POST /bookings 409s on)", async () => {
    const seen: { params?: unknown[] } = {};
    const eff = await getEffectiveDateRules(rulesSql([rule()], seen), "2026-12-26", null);
    expect(eff.blocked).toBe(true);
    expect(seen.params).toContain("2026-12-26");
  });

  it("does not block when only rules for other kinds match", async () => {
    const eff = await getEffectiveDateRules(
      rulesSql([rule({ kind: "price_adjustment", adjustment_type: "flat", adjustment_value: 500 })]),
      "2026-12-26",
      null,
    );
    expect(eff.blocked).toBe(false);
    expect(eff.adjustment).not.toBeNull();
  });

  it("keeps the customer-facing message formal and free of internal reasons", () => {
    expect(BLOCKED_DATE_MESSAGE).toMatch(/not available/i);
    expect(BLOCKED_DATE_MESSAGE).not.toMatch(/reason|admin|rule|block/i);
  });
});

// ── Bulk expansion (range + weekday filter) ──────────────────────────────────

describe("expandRuleDates", () => {
  it("expands an inclusive range into one date per day", () => {
    const dates = expandRuleDates("2026-12-01", "2026-12-31");
    expect(dates).toHaveLength(31);
    expect(dates[0]).toBe("2026-12-01");
    expect(dates[30]).toBe("2026-12-31");
  });

  it("filters to the requested weekdays (every Sat–Sun in December)", () => {
    const weekends = expandRuleDates("2026-12-01", "2026-12-31", [0, 6]);
    expect(weekends).toEqual([
      "2026-12-05", "2026-12-06", "2026-12-12", "2026-12-13",
      "2026-12-19", "2026-12-20", "2026-12-26", "2026-12-27",
    ]);
  });

  it("handles a single day and rejects inverted ranges", () => {
    expect(expandRuleDates("2026-12-25", "2026-12-25")).toEqual(["2026-12-25"]);
    expect(expandRuleDates("2026-12-25", "2026-12-24")).toEqual([]);
  });

  it("returns [] when the weekday filter matches nothing", () => {
    // Dec 7–11 2026 is Mon–Fri; asking for Sundays only.
    expect(expandRuleDates("2026-12-07", "2026-12-11", [0])).toEqual([]);
  });
});

// ── Date coupons: grant + competition with held coupons ──────────────────────

describe("grantDateRuleCoupon", () => {
  const couponRule = rule({
    kind: "coupon",
    coupon_kind: "amount_off",
    coupon_value: 2_000,
    label: "Holiday booking reward",
  });

  it("mints a one-use calendar-source coupon bound to the rule", async () => {
    let inserted: unknown[] | null = null;
    const sql = makeSql((q, params) => {
      if (q.startsWith("INSERT INTO coupons")) {
        inserted = params;
        return [{ id: "c1", code: "SWPR-TEST01", kind: "amount_off", value: 2_000 }];
      }
      throw new Error(`unexpected query: ${q}`);
    });
    const coupon = await grantDateRuleCoupon(sql, { userId: USER_ID, rule: couponRule });
    expect(coupon).not.toBeNull();
    expect(inserted).not.toBeNull();
    expect(inserted!).toContain("calendar"); // source
    expect(inserted!).toContain(couponRule.id); // source_ref (dedup key)
    expect(inserted!).toContain("Holiday booking reward"); // customer-facing title
    expect(inserted!).toContain(USER_ID);
    expect(inserted!).toContain(1); // max_redemptions: single use
  });

  it("is a no-op when the customer already claimed this rule's coupon", async () => {
    const sql = makeSql((q) => {
      if (q.startsWith("INSERT INTO coupons")) {
        throw new Error(
          'duplicate key value violates unique constraint "idx_coupons_source_user_once_calendar"',
        );
      }
      throw new Error(`unexpected query: ${q}`);
    });
    expect(await grantDateRuleCoupon(sql, { userId: USER_ID, rule: couponRule })).toBeNull();
  });

  it("refuses to mint from non-coupon rules", async () => {
    const sql = makeSql(() => {
      throw new Error("no SQL expected");
    });
    expect(await grantDateRuleCoupon(sql, { userId: USER_ID, rule: rule() })).toBeNull();
  });
});

describe("date-coupon competition through autoApplyBestCoupon", () => {
  interface CouponFixture {
    id: string;
    kind: "percent_off" | "amount_off";
    value: number;
  }

  /** Mock backing store for the best-coupon engine: candidate coupons + a
   *  paymentless booking so the Stripe sync branch never runs. */
  function couponSql(
    candidates: CouponFixture[],
    counters: { claims: string[]; redemptions: string[]; ledger: number },
  ): Sql {
    return makeSql((q, params) => {
      if (q.includes("SELECT * FROM coupons")) {
        return candidates.map((c) => ({
          id: c.id,
          code: `SWPR-${c.id}`,
          title: `coupon ${c.id}`,
          kind: c.kind,
          value: c.value,
          addon_key: null,
          min_booking_total_cents: null,
          stackable: false,
          max_stack: null,
          max_redemptions: 1,
          redemption_count: 0,
          status: "active",
        }));
      }
      if (q.startsWith("UPDATE coupons SET redemption_count = redemption_count + 1")) {
        counters.claims.push(String(params[0]));
        return [{ id: params[0] }];
      }
      if (q.includes("SELECT total_price, stripe_payment_intent_id")) {
        return [{ total_price: 20_000, stripe_payment_intent_id: null }];
      }
      if (q.startsWith("UPDATE bookings SET total_price")) {
        return [{ id: BOOKING_ID }];
      }
      if (q.startsWith("INSERT INTO booking_price_ledger")) {
        counters.ledger++;
        return [{ id: `ledger-${counters.ledger}` }];
      }
      if (q.startsWith("INSERT INTO coupon_redemptions")) {
        counters.redemptions.push(String(params[0]));
        return [];
      }
      throw new Error(`unexpected query: ${q}`);
    });
  }

  const stripeNeverCalled = new Proxy({}, {
    get() {
      throw new Error("stripe must not be called for a booking without a PaymentIntent");
    },
  }) as never;

  it("a better coupon the customer already holds beats the date coupon (no stacking)", async () => {
    const counters = { claims: [] as string[], redemptions: [] as string[], ledger: 0 };
    const sql = couponSql(
      [
        { id: "held30", kind: "percent_off", value: 30 }, // 30% of $200 = $60
        { id: "calendar20", kind: "amount_off", value: 2_000 }, // the date coupon: $20
      ],
      counters,
    );
    const applied = await autoApplyBestCoupon(sql, stripeNeverCalled, {
      bookingId: BOOKING_ID,
      userId: USER_ID,
      totalCents: 20_000,
    });
    expect(applied?.amountAppliedCents).toBe(6_000);
    // Exactly ONE coupon claimed and redeemed — the held one; the date coupon
    // is untouched (and expires within a day, so it can't linger).
    expect(counters.claims).toEqual(["held30"]);
    expect(counters.redemptions).toEqual(["held30"]);
  });

  it("the date coupon applies when it is the best (or only) coupon", async () => {
    const counters = { claims: [] as string[], redemptions: [] as string[], ledger: 0 };
    const sql = couponSql([{ id: "calendar20", kind: "amount_off", value: 2_000 }], counters);
    const applied = await autoApplyBestCoupon(sql, stripeNeverCalled, {
      bookingId: BOOKING_ID,
      userId: USER_ID,
      totalCents: 20_000,
    });
    expect(applied?.amountAppliedCents).toBe(2_000);
    expect(counters.claims).toEqual(["calendar20"]);
    expect(counters.redemptions).toEqual(["calendar20"]);
  });
});

// ── Public availability (labels only — never internal reasons) ───────────────

describe("publicAvailability", () => {
  it("returns compact day entries and leaks nothing internal", async () => {
    const rows = [
      rule({ rule_date: "2026-12-24", kind: "block", reason: "Team offsite — do not tell anyone" }),
      rule({
        rule_date: "2026-12-26",
        kind: "price_adjustment",
        adjustment_type: "percent",
        adjustment_value: 10,
        label: "Holiday pricing",
        reason: "internal margin note",
      }),
      rule({
        rule_date: "2026-12-28",
        kind: "coupon",
        coupon_kind: "amount_off",
        coupon_value: 2_000,
        label: "Book this date, save $20",
      }),
    ];
    const sql = makeSql((q) => {
      if (q.includes("FROM calendar_date_rules")) return rows as unknown as Row[];
      throw new Error(`unexpected query: ${q}`);
    });
    const days = await publicAvailability(sql, "2026-12-01", "2026-12-31", null);
    expect(days).toEqual([
      { date: "2026-12-24", blocked: true },
      { date: "2026-12-26", adjustmentLabel: "Holiday pricing" },
      { date: "2026-12-28", promoLabel: "Book this date, save $20" },
    ]);
    // No reasons, values, ids, or scopes in the payload.
    const json = JSON.stringify(days);
    expect(json).not.toMatch(/reason|offsite|internal|adjustment_value|service_area/);
  });

  it("suppresses pricing/promo labels on a date that is blocked anyway", async () => {
    const rows = [
      rule({ rule_date: "2026-12-24", kind: "block" }),
      rule({
        rule_date: "2026-12-24",
        kind: "price_adjustment",
        adjustment_type: "percent",
        adjustment_value: 10,
        label: "Holiday pricing",
      }),
    ];
    const sql = makeSql(() => rows as unknown as Row[]);
    const days = await publicAvailability(sql, "2026-12-01", "2026-12-31", null);
    expect(days).toEqual([{ date: "2026-12-24", blocked: true }]);
  });
});

// ── Admin CRUD auth ──────────────────────────────────────────────────────────

describe("admin calendar router auth", () => {
  it("rejects unauthenticated reads and writes with 401", async () => {
    const env = {} as Record<string, unknown>;
    const read = await adminCalendarRouter.request("/?from=2026-12-01&to=2026-12-31", {}, env);
    expect(read.status).toBe(401);

    const write = await adminCalendarRouter.request(
      "/rules",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "block", label: "x", startDate: "2026-12-25" }),
      },
      env,
    );
    expect(write.status).toBe(401);

    const del = await adminCalendarRouter.request(
      "/rules/bulk-delete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ["33333333-3333-4333-8333-333333333333"] }),
      },
      env,
    );
    expect(del.status).toBe(401);
  });
});
