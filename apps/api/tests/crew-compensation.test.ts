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
 * Team Cleans per-member compensation:
 *   - pool → split (54/46, 36/32/32, NO_SHOW excluded → reduced-size split)
 *   - one Stripe transfer per member (distinct idempotency keys, shared group)
 *   - customer tip split EQUAL across completed crew (never 100% to the lead)
 *   - peer thumbs allowed once per ordered pair, then rejected
 *   - solo/degenerate-crew path pays the lead the full pool (unchanged)
 */
import { describe, it, expect, vi } from "vitest";
import {
  splitPoolCents,
  computeCrewEarnings,
  releaseCrewPayouts,
} from "../src/lib/crew/crewPayout";
import { payoutSplitFractions, DEFAULT_CREW_CONFIG } from "../src/lib/crew/crewConfig";
import { tipSplitFractions } from "../src/routes/tips";
import { submitPeerRating } from "../src/lib/crew/crewPeerRating";
import type { Sql } from "@sweepr/db";

interface Recorded { text: string; values: unknown[] }
function makeSql(handler: (text: string, values: unknown[]) => unknown) {
  const calls: Recorded[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  }) as unknown as Sql;
  return { sql, calls };
}

type Seat = {
  id: string;
  cleaner_id: string;
  role: "LEAD" | "MEMBER";
  seat_index: number;
  status: string;
  earnings_cents: number;
  stripe_transfer_id: string | null;
};

/**
 * A handler covering the pool computation (fees/tier/founding all default → 1),
 * default crew config, and the present-seat reads/writes. `total_price` is chosen
 * so the pool (total − the default 30% Marketplace Services Fee) is a round number.
 */
function payoutHandler(opts: {
  totalPrice: number;
  seats: Seat[];
}) {
  const earningsWrites: Record<string, number> = {};
  const seats = opts.seats;
  const handler = (text: string, values: unknown[]): unknown => {
    if (text.includes("FROM platform_fee_settings")) return []; // → DEFAULT_SETTINGS (30%)
    if (text.includes("founding_member")) return [{ founding_member: false, founding_member_revoked: false }];
    if (text.includes("FROM cleaner_tier_multipliers")) return []; // → 1.0
    if (text.includes("stripe_connect_id FROM cleaners")) {
      return [{ stripe_connect_id: `acct_${String(values[0])}` }];
    }
    if (text.includes("tier FROM cleaners")) return [{ tier: "standard" }];
    if (text.includes("FROM site_settings")) return []; // crew_config → defaults
    if (text.includes("total_price") && text.includes("FROM bookings")) {
      return [{ id: "b1", cleaner_id: "cl-lead", total_price: opts.totalPrice, founding_customer_discount_cents: 0, crew_status: "COMPLETED" }];
    }
    // Present-seat read used by releaseCrewPayouts (has earnings_cents + transfer id).
    if (text.includes("FROM booking_crew_assignments") && text.includes("stripe_transfer_id")) {
      return seats.map((s) => ({ ...s }));
    }
    // Present-seat read used by computeCrewEarnings.
    if (text.includes("FROM booking_crew_assignments") && text.includes("SELECT id, cleaner_id, role")) {
      return seats.map((s) => ({ id: s.id, cleaner_id: s.cleaner_id, role: s.role, seat_index: s.seat_index, status: s.status }));
    }
    if (text.includes("UPDATE booking_crew_assignments") && text.includes("earnings_cents")) {
      // values: [earnings, id]
      earningsWrites[String(values[1])] = Number(values[0]);
      const seat = seats.find((s) => s.id === values[1]);
      if (seat) seat.earnings_cents = Number(values[0]);
      return [];
    }
    if (text.includes("UPDATE booking_crew_assignments") && text.includes("stripe_transfer_id")) {
      // claim (sentinel) or finalize — return a row so the claim succeeds.
      const id = String(values[values.length - 1]);
      return [{ id }];
    }
    return [];
  };
  return { handler, earningsWrites, seats };
}

function seat(id: string, cleanerId: string, role: "LEAD" | "MEMBER", idx: number): Seat {
  return { id, cleaner_id: cleanerId, role, seat_index: idx, status: role === "LEAD" ? "COMPLETED" : "COMPLETED", earnings_cents: 0, stripe_transfer_id: null };
}

describe("splitPoolCents — exact integer-cent conservation, lead absorbs remainder", () => {
  it("54/46 two-person", () => {
    expect(splitPoolCents(6000, [0.54, 0.46])).toEqual([3240, 2760]);
  });
  it("36/32/32 three-person", () => {
    expect(splitPoolCents(10000, [0.36, 0.32, 0.32])).toEqual([3600, 3200, 3200]);
  });
  it("lead absorbs the rounding remainder (support seats round, lead takes the rest)", () => {
    // 5250 × 0.46 = 2415 exactly; 5251 × 0.46 = 2415.46 → support 2415, lead 2836.
    expect(splitPoolCents(5251, [0.54, 0.46])).toEqual([2836, 2415]);
    expect(splitPoolCents(5251, [0.54, 0.46]).reduce((a, b) => a + b, 0)).toBe(5251);
  });
  it("conserves the pool exactly when fractions don't divide evenly", () => {
    const parts = splitPoolCents(10001, [1 / 3, 1 / 3, 1 / 3]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10001);
  });
  it("degenerate crew of one pays the lead the whole pool (solo-equivalent)", () => {
    expect(payoutSplitFractions(DEFAULT_CREW_CONFIG, 1)).toEqual([1]);
    expect(splitPoolCents(6000, [1])).toEqual([6000]);
  });
});

describe("computeCrewEarnings — pool split written per seat", () => {
  it("splits a 5250¢ pool 54/46 across two completed seats", async () => {
    const seats = [seat("a-lead", "cl-lead", "LEAD", 0), seat("a-mem", "cl-mem", "MEMBER", 1)];
    const { handler, earningsWrites } = payoutHandler({ totalPrice: 7500, seats });
    const { sql } = makeSql(handler);

    const res = await computeCrewEarnings(sql, "b1");
    expect(res.poolCents).toBe(5250); // 7500 − 30% fee
    expect(res.presentCrewSize).toBe(2);
    expect(earningsWrites["a-lead"]).toBe(2835);
    expect(earningsWrites["a-mem"]).toBe(2415);
  });

  it("splits an 8750¢ pool 36/32/32 across three completed seats", async () => {
    const seats = [
      seat("l", "cl-lead", "LEAD", 0),
      seat("m1", "cl-m1", "MEMBER", 1),
      seat("m2", "cl-m2", "MEMBER", 2),
    ];
    const { handler, earningsWrites } = payoutHandler({ totalPrice: 12500, seats });
    const { sql } = makeSql(handler);

    const res = await computeCrewEarnings(sql, "b1");
    expect(res.poolCents).toBe(8750); // 12500 − 30% fee
    expect(res.presentCrewSize).toBe(3);
    expect(earningsWrites["l"]).toBe(3150);
    expect(earningsWrites["m1"]).toBe(2800);
    expect(earningsWrites["m2"]).toBe(2800);
    expect(Object.values(earningsWrites).reduce((a, b) => a + b, 0)).toBe(8750);
  });

  it("excludes a NO_SHOW: the remaining crew splits the SAME pool by the reduced size", async () => {
    // The NO_SHOW seat is filtered out by the present-seat query, so only two
    // seats come back → 54/46 of the unchanged 5250¢ pool.
    const seats = [seat("l", "cl-lead", "LEAD", 0), seat("m1", "cl-m1", "MEMBER", 1)];
    const { handler, earningsWrites } = payoutHandler({ totalPrice: 7500, seats });
    const { sql } = makeSql(handler);

    const res = await computeCrewEarnings(sql, "b1");
    expect(res.presentCrewSize).toBe(2);
    expect(res.poolCents).toBe(5250);
    expect(earningsWrites["l"]).toBe(2835);
    expect(earningsWrites["m1"]).toBe(2415);
  });
});

describe("releaseCrewPayouts — one transfer per member", () => {
  it("creates one transfer per member with distinct idempotency keys and a shared transfer_group", async () => {
    const seats = [seat("a-lead", "cl-lead", "LEAD", 0), seat("a-mem", "cl-mem", "MEMBER", 1)];
    const { handler } = payoutHandler({ totalPrice: 7500, seats });
    const { sql } = makeSql(handler);

    const created: Array<{ params: Record<string, unknown>; opts: { idempotencyKey: string } }> = [];
    const stripe = {
      transfers: {
        create: vi.fn(async (params: Record<string, unknown>, o: { idempotencyKey: string }) => {
          created.push({ params, opts: o });
          return { id: `tr_${created.length}` };
        }),
      },
    } as unknown as import("stripe").default;

    const summary = await releaseCrewPayouts(sql, stripe, "b1");

    expect(created).toHaveLength(2);
    expect(created[0].params.amount).toBe(2835);
    expect(created[1].params.amount).toBe(2415);
    // Distinct idempotency keys, shared transfer_group.
    const keys = created.map((c) => c.opts.idempotencyKey);
    expect(new Set(keys).size).toBe(2);
    expect(keys).toEqual(["payout_b1_a-lead", "payout_b1_a-mem"]);
    expect(created.every((c) => c.params.transfer_group === "booking_b1")).toBe(true);
    expect(summary.allSucceeded).toBe(true);
    expect(summary.transfers.map((t) => t.status)).toEqual(["transferred", "transferred"]);
  });

  it("skips a seat that already carries a real transfer id (idempotent re-run)", async () => {
    const seats = [
      { ...seat("a-lead", "cl-lead", "LEAD", 0), earnings_cents: 2835, stripe_transfer_id: "tr_existing" },
      seat("a-mem", "cl-mem", "MEMBER", 1),
    ];
    const { handler } = payoutHandler({ totalPrice: 7500, seats });
    const { sql } = makeSql(handler);
    const stripe = {
      transfers: { create: vi.fn(async () => ({ id: "tr_new" })) },
    } as unknown as import("stripe").default;

    const summary = await releaseCrewPayouts(sql, stripe, "b1");
    expect(stripe.transfers.create).toHaveBeenCalledTimes(1); // only the member
    const statuses = summary.transfers.map((t) => t.status).sort();
    expect(statuses).toEqual(["skipped", "transferred"]);
  });
});

describe("tip split — equal across completed crew, never 100% to the lead", () => {
  it("EQUAL divides the tip evenly", () => {
    const members = [{ earnings_cents: 3600 }, { earnings_cents: 2400 }, { earnings_cents: 2400 }];
    const fractions = tipSplitFractions("EQUAL", members);
    const shares = splitPoolCents(3000, fractions);
    expect(shares).toEqual([1000, 1000, 1000]);
    // Lead (index 0) is NOT the whole tip.
    expect(shares[0]).toBeLessThan(3000);
  });
  it("structure supports PROPORTIONAL_TO_EARNINGS", () => {
    const members = [{ earnings_cents: 3600 }, { earnings_cents: 3200 }, { earnings_cents: 3200 }];
    expect(tipSplitFractions("PROPORTIONAL_TO_EARNINGS", members)).toEqual([0.36, 0.32, 0.32]);
  });
});

describe("submitPeerRating — allowed once per ordered pair, then rejected", () => {
  function peerHandler(state: { rated: boolean }) {
    return (text: string): unknown => {
      // Both cleaners present on this booking.
      if (text.includes("FROM booking_crew_assignments") && text.includes("cleaner_id = ANY")) {
        return [{ cleaner_id: "cl-a" }, { cleaner_id: "cl-b" }];
      }
      // No OTHER shared booking (this is their first pairing).
      if (text.includes("JOIN booking_crew_assignments")) return [];
      if (text.includes("FROM crew_peer_ratings")) return state.rated ? [{ x: 1 }] : [];
      if (text.includes("INSERT INTO crew_peer_ratings")) {
        if (state.rated) return []; // ON CONFLICT DO NOTHING
        state.rated = true;
        return [{ id: "peer-1" }];
      }
      return [];
    };
  }

  it("accepts the first rating and rejects a second for the same pair", async () => {
    const state = { rated: false };
    const { sql } = makeSql(peerHandler(state));
    const input = { bookingId: "b1", raterCleanerId: "cl-a", rateeCleanerId: "cl-b", thumbs: "up" as const };

    const first = await submitPeerRating(sql, input);
    expect(first).toEqual({ ok: true, id: "peer-1" });

    const second = await submitPeerRating(sql, input);
    expect(second).toEqual({ ok: false, code: "ALREADY_RATED" });
  });

  it("rejects rating yourself", async () => {
    const { sql } = makeSql(peerHandler({ rated: false }));
    const res = await submitPeerRating(sql, { bookingId: "b1", raterCleanerId: "cl-a", rateeCleanerId: "cl-a", thumbs: "down" });
    expect(res).toEqual({ ok: false, code: "SELF" });
  });

  it("rejects when the two did not share this booking", async () => {
    const { sql } = makeSql((text: string) => {
      if (text.includes("cleaner_id = ANY")) return [{ cleaner_id: "cl-a" }]; // only rater present
      return [];
    });
    const res = await submitPeerRating(sql, { bookingId: "b1", raterCleanerId: "cl-a", rateeCleanerId: "cl-b", thumbs: "up" });
    expect(res).toEqual({ ok: false, code: "NOT_SHARED" });
  });

  it("rejects a later pairing (NOT their first shared booking)", async () => {
    const { sql } = makeSql((text: string) => {
      if (text.includes("cleaner_id = ANY")) return [{ cleaner_id: "cl-a" }, { cleaner_id: "cl-b" }];
      if (text.includes("FROM crew_peer_ratings")) return [];
      if (text.includes("JOIN booking_crew_assignments")) return [{ booking_id: "older" }]; // shared before
      return [];
    });
    const res = await submitPeerRating(sql, { bookingId: "b1", raterCleanerId: "cl-a", rateeCleanerId: "cl-b", thumbs: "up" });
    expect(res).toEqual({ ok: false, code: "NOT_FIRST" });
  });
});
