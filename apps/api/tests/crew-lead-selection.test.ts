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
 * LEAD selection — historical performance is the PRIMARY criterion (owner
 * decision). Verifies the documented formula in crewMatching.rankLeadCandidates:
 *
 *   leadScore = 60·min(total_jobs/25, 1) + 50·(rating/5, 0.6 unrated)
 *             + 40·reliability + 10·continuity + baseScore
 *
 * with reliability = good/(good+bad) over completed vs cancelled_by_cleaner
 * bookings plus MEMBER crew-seat outcomes (0.9 with no history). The
 * performance ceiling (150) exceeds the base ceiling (90), so a proven
 * cleaner outranks a perfect base score with no track record.
 */
import { describe, it, expect, vi } from "vitest";
import type { Sql, BookingRow, CleanerRow } from "@sweepr/db";

// The base ranking is mocked so tests control base scores directly; the
// eligibility gate passes everyone through (hard filters are covered by the
// solo-engine tests).
const baseScores: Record<string, number> = {};
vi.mock("../src/lib/matching", () => ({
  eligibleCleanersForBooking: vi.fn(async (_b: unknown, c: Array<{ id: string }>) => c),
  rankCleanersForBooking: vi.fn(async (_b: unknown, c: Array<{ id: string }>) =>
    c.map((x) => ({ cleanerId: x.id, score: baseScores[x.id] ?? 0, breakdown: {} })),
  ),
}));

import { rankLeadCandidates } from "../src/lib/crew/crewMatching";

interface RelRow { cleaner_id: string; good: number; bad: number }

function makeSql(opts: {
  bookingRel?: RelRow[];
  memberSeatRel?: RelRow[];
  continuity?: Array<{ cleaner_id: string; jobs: number }>;
}): Sql {
  return ((strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("FROM bookings") && text.includes("cancelled_by_cleaner")) {
      return Promise.resolve(opts.bookingRel ?? []);
    }
    if (text.includes("FROM booking_crew_assignments") && text.includes("role = 'MEMBER'")) {
      return Promise.resolve(opts.memberSeatRel ?? []);
    }
    if (text.includes("bca.role = 'LEAD'")) {
      return Promise.resolve(opts.continuity ?? []);
    }
    return Promise.resolve([]);
  }) as unknown as Sql;
}

function cleaner(id: string, totalJobs: number, rating: string | null): CleanerRow {
  return {
    id, user_id: `u-${id}`, first_name: id, last_name: "T", phone: null, bio: null,
    avatar_url: null, status: "active", stripe_connect_id: null, account_type: null,
    checkr_candidate_id: null, checkr_report_id: null, checkr_status: null,
    yardstik_candidate_id: null, yardstik_report_id: null, yardstik_status: null,
    didit_verification_id: null, didit_status: null, tier: "standard",
    rating, total_jobs: totalJobs, created_at: new Date().toISOString(),
  };
}

const booking = {
  id: "bk-1",
  customer_id: "cust-1",
  service_type: "standard",
  scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
} as unknown as BookingRow;

describe("rankLeadCandidates — performance-primary ordering", () => {
  it("a proven cleaner (jobs + rating + record) outranks a max base score with no history", async () => {
    baseScores.proven = 30; // mediocre base (distance/fairness/etc.)
    baseScores.fresh = 90; // the solo ceiling
    const sql = makeSql({
      bookingRel: [{ cleaner_id: "proven", good: 40, bad: 0 }],
    });

    const ranked = await rankLeadCandidates(booking, sql, {
      candidatePool: [cleaner("proven", 25, "5.0"), cleaner("fresh", 0, null)],
    });

    expect(ranked[0].cleanerId).toBe("proven");
    // proven: 30 base + 60 jobVolume + 50 rating + 40 reliability = 180.
    expect(ranked[0].score).toBeCloseTo(180, 1);
    // fresh: 90 base + 0 jobVolume + 30 (0.6 neutral rating) + 36 (0.9 default) = 156.
    expect(ranked[1].score).toBeCloseTo(156, 1);
  });

  it("a no-show/cancel record drags the lead score down", async () => {
    baseScores.reliable = 50;
    baseScores.flaky = 50;
    const sql = makeSql({
      bookingRel: [
        { cleaner_id: "reliable", good: 20, bad: 0 },
        { cleaner_id: "flaky", good: 10, bad: 10 }, // 0.5 reliability
      ],
    });

    const ranked = await rankLeadCandidates(booking, sql, {
      candidatePool: [cleaner("flaky", 20, "4.5"), cleaner("reliable", 20, "4.5")],
    });
    expect(ranked[0].cleanerId).toBe("reliable");
    const reliable = ranked.find((r) => r.cleanerId === "reliable")!;
    const flaky = ranked.find((r) => r.cleanerId === "flaky")!;
    // Identical apart from reliability: 40·1.0 vs 40·0.5 → 20 points apart.
    expect(reliable.score - flaky.score).toBeCloseTo(20, 1);
  });

  it("MEMBER crew-seat outcomes count toward reliability (no LEAD-seat double count)", async () => {
    baseScores.helper = 50;
    const sql = makeSql({
      bookingRel: [{ cleaner_id: "helper", good: 5, bad: 0 }],
      memberSeatRel: [{ cleaner_id: "helper", good: 3, bad: 2 }], // combined 8/10 = 0.8
    });
    const ranked = await rankLeadCandidates(booking, sql, {
      candidatePool: [cleaner("helper", 10, "4.0")],
    });
    expect(ranked[0].breakdown.reliability).toBeCloseTo(40 * 0.8, 1);
  });

  it("continuity with THIS customer adds up to 10 points and the breakdown names every term", async () => {
    baseScores.known = 50;
    baseScores.stranger = 50;
    const sql = makeSql({
      continuity: [{ cleaner_id: "known", jobs: 3 }],
    });
    const ranked = await rankLeadCandidates(booking, sql, {
      candidatePool: [cleaner("stranger", 10, "4.0"), cleaner("known", 10, "4.0")],
    });
    expect(ranked[0].cleanerId).toBe("known");
    expect(ranked[0].score - ranked[1].score).toBeCloseTo(10, 1);
    for (const key of ["base", "jobVolume", "ratingAvg", "reliability", "continuity"]) {
      expect(ranked[0].breakdown).toHaveProperty(key);
    }
  });
});
