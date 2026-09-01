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
 * Cleaner job-type preferences (migration 107, cleaners.accepted_job_types):
 *   - canonical mapping of wire service types (the way the quote engine maps
 *     them): move_in_out / vacation_rental keep their identity, everything
 *     else (standard, deep, recurring, light, …) counts as standard;
 *   - the matching HARD FILTER: a cleaner who opted out of a booking's
 *     canonical job type is never ranked for it (solo engine — the crew
 *     engine's LEAD/MEMBER ranking and the accept-time revalidation both run
 *     through the same rankCleanersForBooking, so they inherit this);
 *   - pre-migration/NULL reads are treated as all-types-accepted.
 */
import { describe, it, expect } from "vitest";
import type { Sql, BookingRow, CleanerRow } from "@sweepr/db";
import { canonicalJobType, rankCleanersForBooking } from "../src/lib/matching";

describe("canonicalJobType — wire service type → preference domain", () => {
  it("maps exactly like the quote engine's pricing paths", () => {
    expect(canonicalJobType("move_in_out")).toBe("move_in_out");
    expect(canonicalJobType("vacation_rental")).toBe("vacation_rental");
    expect(canonicalJobType("standard")).toBe("standard");
    expect(canonicalJobType("recurring")).toBe("standard");
    expect(canonicalJobType("light")).toBe("standard");
    expect(canonicalJobType(null)).toBe("standard");
    expect(canonicalJobType(undefined)).toBe("standard");
  });

  it("deep-clean (auto-classified) bookings count as Standard for preferences", () => {
    expect(canonicalJobType("deep")).toBe("standard");
  });
});

// ── rankCleanersForBooking hard filter ───────────────────────────────────────

function cleaner(id: string): CleanerRow {
  return {
    id,
    user_id: `u-${id}`,
    first_name: id,
    last_name: "Test",
    phone: null,
    bio: null,
    avatar_url: null,
    status: "active",
    stripe_connect_id: null,
    account_type: null,
    checkr_candidate_id: null,
    checkr_report_id: null,
    checkr_status: null,
    yardstik_candidate_id: null,
    yardstik_report_id: null,
    yardstik_status: null,
    didit_verification_id: null,
    didit_status: null,
    tier: "standard",
    rating: null,
    total_jobs: 5,
    created_at: new Date().toISOString(),
  };
}

function booking(serviceType: string): BookingRow {
  return {
    id: "bk-1",
    customer_id: null,
    service_type: serviceType,
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
    address_id: null,
  } as unknown as BookingRow;
}

/** sql mock: only the cleaners accepted_job_types read returns data. */
function makeSql(acceptedByCleaner: Record<string, string[] | null>): Sql {
  return ((strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("accepted_job_types")) {
      return Promise.resolve(
        Object.entries(acceptedByCleaner).map(([id, types]) => ({
          cleaner_id: id,
          accepted_job_types: types,
          founding_member: false,
          founding_member_revoked: false,
        })),
      );
    }
    return Promise.resolve([]);
  }) as unknown as Sql;
}

describe("matching hard filter — accepted_job_types", () => {
  it("a vacation_rental booking excludes cleaners who opted out of Airbnb/Turnover", async () => {
    const sql = makeSql({
      a: ["standard", "move_in_out", "vacation_rental"],
      b: ["standard", "move_in_out"], // opted out of turnovers
      c: ["vacation_rental"],
    });
    const ranked = await rankCleanersForBooking(
      booking("vacation_rental"),
      [cleaner("a"), cleaner("b"), cleaner("c")],
      sql,
    );
    expect(new Set(ranked.map((r) => r.cleanerId))).toEqual(new Set(["a", "c"]));
  });

  it("a deep booking counts as Standard: standard-accepting cleaners stay in", async () => {
    const sql = makeSql({
      a: ["standard"],
      b: ["move_in_out", "vacation_rental"], // opted out of standard (and thus deep)
    });
    const ranked = await rankCleanersForBooking(booking("deep"), [cleaner("a"), cleaner("b")], sql);
    expect(ranked.map((r) => r.cleanerId)).toEqual(["a"]);
  });

  it("a move_in_out booking only reaches cleaners accepting move_in_out", async () => {
    const sql = makeSql({
      a: ["standard"],
      b: ["standard", "move_in_out"],
    });
    const ranked = await rankCleanersForBooking(booking("move_in_out"), [cleaner("a"), cleaner("b")], sql);
    expect(ranked.map((r) => r.cleanerId)).toEqual(["b"]);
  });

  it("NULL / empty accepted_job_types (pre-migration row) = all types accepted", async () => {
    const sql = makeSql({ a: null, b: [] });
    const ranked = await rankCleanersForBooking(
      booking("vacation_rental"),
      [cleaner("a"), cleaner("b")],
      sql,
    );
    expect(new Set(ranked.map((r) => r.cleanerId))).toEqual(new Set(["a", "b"]));
  });

  it("preferences are strict: zero eligible candidates yields an empty ranking (no fail-open)", async () => {
    const sql = makeSql({ a: ["standard"], b: ["standard"] });
    const ranked = await rankCleanersForBooking(
      booking("vacation_rental"),
      [cleaner("a"), cleaner("b")],
      sql,
    );
    // The assignment engine then takes its existing no-candidates path
    // (status 'matching' + admin match_needed alert) — never ignores opt-outs.
    expect(ranked).toEqual([]);
  });
});
