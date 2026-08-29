/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { Sql } from "@sweepr/db";
import {
  generateVouchPin,
  verifyVouchPin,
  recordCrewCheckIn,
  handleNoShow,
  completeCrewBooking,
  PIN_WINDOW_MS,
  PIN_DIGITS,
} from "../src/lib/crew/crewDayOfService";
import { DEFAULT_CREW_CONFIG } from "../src/lib/crew/crewConfig";

// ── Template-tag SQL mock (see docs/team-cleans-audit.md §12) ────────────────
const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
type Handler = (text: string, values: unknown[]) => unknown;
let handler: Handler = () => [];

function makeSql(): Sql {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    sqlCalls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  }) as unknown as Sql;
}

beforeEach(() => {
  sqlCalls.length = 0;
  handler = () => [];
});

const SECRET = "test-vouch-secret";

// ── PIN mechanism ────────────────────────────────────────────────────────────
describe("vouch PIN (ephemeral, derived — no schema change)", () => {
  it("generates a numeric PIN of the fixed length", async () => {
    const { pin, expiresAt } = await generateVouchPin("seat-1", SECRET, 1_000_000);
    expect(pin).toMatch(new RegExp(`^\\d{${PIN_DIGITS}}$`));
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(1_000_000);
  });

  it("a freshly generated PIN verifies", async () => {
    const now = 5 * PIN_WINDOW_MS + 123;
    const { pin } = await generateVouchPin("seat-1", SECRET, now);
    expect(await verifyVouchPin("seat-1", pin, SECRET, now)).toBe(true);
  });

  it("rejects a wrong PIN", async () => {
    const now = Date.now();
    const { pin } = await generateVouchPin("seat-1", SECRET, now);
    const wrong = pin === "000000" ? "111111" : "000000";
    expect(await verifyVouchPin("seat-1", wrong, SECRET, now)).toBe(false);
  });

  it("is seat-specific: another seat's PIN does not verify", async () => {
    const now = Date.now();
    const { pin } = await generateVouchPin("seat-1", SECRET, now);
    expect(await verifyVouchPin("seat-2", pin, SECRET, now)).toBe(false);
  });

  it("accepts the immediately previous window (grace) but rejects older/expired", async () => {
    const now = 10 * PIN_WINDOW_MS;
    const { pin } = await generateVouchPin("seat-1", SECRET, now);
    // One window later: still valid (grace).
    expect(await verifyVouchPin("seat-1", pin, SECRET, now + PIN_WINDOW_MS)).toBe(true);
    // Two windows later: expired.
    expect(await verifyVouchPin("seat-1", pin, SECRET, now + 2 * PIN_WINDOW_MS + 1)).toBe(false);
  });

  it("rejects malformed PIN input", async () => {
    const now = Date.now();
    expect(await verifyVouchPin("seat-1", "abc", SECRET, now)).toBe(false);
    expect(await verifyVouchPin("seat-1", "12345", SECRET, now)).toBe(false);
  });
});

// ── Independent per-member check-in ──────────────────────────────────────────
describe("recordCrewCheckIn — independent, claim-then-act", () => {
  it("checks in an ACCEPTED, not-yet-present seat", async () => {
    handler = (text) => {
      if (text.includes("UPDATE booking_crew_assignments") && text.includes("check_in_at = ?")) {
        return [{ id: "member-seat", booking_id: "bk", cleaner_id: "cl-m", role: "MEMBER",
                  seat_index: 1, status: "ACCEPTED", person_minutes: 200, earnings_cents: 0,
                  check_in_at: "2026-08-29T10:00:00Z", check_out_at: null, vouched_by_assignment_id: null }];
      }
      return [];
    };
    const res = await recordCrewCheckIn(makeSql(), { bookingId: "bk", assignmentId: "member-seat" });
    expect(res.ok).toBe(true);
    expect(res.seat?.check_in_at).toBeTruthy();
  });

  it("lead check-in does NOT mark members present (only the targeted seat is claimed)", async () => {
    // The claim UPDATE is keyed by the seat id; a lead check-in updates only the
    // lead's row. Simulate: only the lead seat id claims a row.
    handler = (text, values) => {
      if (text.includes("UPDATE booking_crew_assignments") && text.includes("check_in_at = ?")) {
        const assignmentId = values[2]; // SET now, vouchedBy; WHERE id, booking_id
        if (assignmentId === "lead-seat") {
          return [{ id: "lead-seat", booking_id: "bk", cleaner_id: "cl-l", role: "LEAD",
                    seat_index: 0, status: "ACCEPTED", person_minutes: 200, earnings_cents: 0,
                    check_in_at: "2026-08-29T10:00:00Z", check_out_at: null, vouched_by_assignment_id: null }];
        }
        return [];
      }
      // For the member: after the (empty) claim, re-select returns a still-absent seat.
      if (text.includes("FROM booking_crew_assignments") && text.includes("AND id = ?")) {
        return [{ id: "member-seat", booking_id: "bk", cleaner_id: "cl-m", role: "MEMBER",
                  seat_index: 1, status: "ACCEPTED", person_minutes: 200, earnings_cents: 0,
                  check_in_at: null, check_out_at: null, vouched_by_assignment_id: null }];
      }
      return [];
    };
    const sql = makeSql();
    const lead = await recordCrewCheckIn(sql, { bookingId: "bk", assignmentId: "lead-seat" });
    expect(lead.ok).toBe(true);
    // The member seat is still not present — the lead's check-in never touched it.
    const member = await recordCrewCheckIn(sql, { bookingId: "bk", assignmentId: "member-seat" });
    // The claim for the member returns nothing, so it is not marked present here.
    expect(member.ok).toBe(false);
    expect(member.seat?.check_in_at).toBeNull();
  });

  it("returns already_checked_in when the seat has a check_in_at", async () => {
    handler = (text) => {
      if (text.includes("UPDATE booking_crew_assignments") && text.includes("check_in_at = ?")) return [];
      if (text.includes("FROM booking_crew_assignments") && text.includes("AND id = ?")) {
        return [{ id: "member-seat", booking_id: "bk", cleaner_id: "cl-m", role: "MEMBER",
                  seat_index: 1, status: "ACCEPTED", person_minutes: 200, earnings_cents: 0,
                  check_in_at: "2026-08-29T09:00:00Z", check_out_at: null, vouched_by_assignment_id: null }];
      }
      return [];
    };
    const res = await recordCrewCheckIn(makeSql(), { bookingId: "bk", assignmentId: "member-seat" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("already_checked_in");
  });

  it("a valid PIN vouch marks the member present with vouched_by set", async () => {
    let capturedVouchedBy: unknown = "unset";
    handler = (text, values) => {
      if (text.includes("UPDATE booking_crew_assignments") && text.includes("vouched_by_assignment_id = ?")) {
        capturedVouchedBy = values[1]; // (now, vouchedBy, assignmentId, bookingId)
        return [{ id: "member-seat", booking_id: "bk", cleaner_id: "cl-m", role: "MEMBER",
                  seat_index: 1, status: "ACCEPTED", person_minutes: 200, earnings_cents: 0,
                  check_in_at: "2026-08-29T10:05:00Z", check_out_at: null,
                  vouched_by_assignment_id: "lead-seat" }];
      }
      return [];
    };
    const res = await recordCrewCheckIn(makeSql(), {
      bookingId: "bk", assignmentId: "member-seat", vouchedByAssignmentId: "lead-seat",
    });
    expect(res.ok).toBe(true);
    expect(capturedVouchedBy).toBe("lead-seat");
    expect(res.seat?.vouched_by_assignment_id).toBe("lead-seat");
  });
});

// ── No-show handling ─────────────────────────────────────────────────────────
describe("handleNoShow — NO_SHOW + AT_RISK + zero pay + re-plan", () => {
  it("marks NO_SHOW with zero earnings, sets AT_RISK, and recomputes elapsed for the reduced crew", async () => {
    let atRiskSet = false;
    let earningsZeroed = false;
    handler = (text) => {
      if (text.includes("UPDATE booking_crew_assignments") && text.includes("status = 'NO_SHOW'")) {
        if (text.includes("earnings_cents = 0")) earningsZeroed = true;
        return [{ id: "member-seat" }];
      }
      if (text.includes("UPDATE bookings") && text.includes("crew_status = 'AT_RISK'")) {
        atRiskSet = true;
        return [];
      }
      if (text.includes("FILTER (WHERE status IN ('ACCEPTED', 'COMPLETED'))")) {
        // 1 cleaner still present (the lead); 600 person-minutes of total labor.
        return [{ present: 1, total_pm: 600 }];
      }
      return [];
    };
    const res = await handleNoShow(makeSql(), {
      bookingId: "bk", assignmentId: "member-seat", config: DEFAULT_CREW_CONFIG,
    });
    expect(res.ok).toBe(true);
    expect(earningsZeroed).toBe(true);
    expect(atRiskSet).toBe(true);
    expect(res.presentCrewSize).toBe(1);
    expect(res.personMinutes).toBe(600);
    // Solo (1 cleaner) elapsed for 600 person-min = 600 (capacity 1.0).
    expect(res.revisedElapsedMinutes).toBe(600);
  });

  it("recomputes a smaller elapsed when 2 cleaners remain", async () => {
    handler = (text) => {
      if (text.includes("UPDATE booking_crew_assignments") && text.includes("status = 'NO_SHOW'")) return [{ id: "s" }];
      if (text.includes("FILTER (WHERE status IN ('ACCEPTED', 'COMPLETED'))")) return [{ present: 2, total_pm: 600 }];
      return [];
    };
    const res = await handleNoShow(makeSql(), {
      bookingId: "bk", assignmentId: "member-seat", config: DEFAULT_CREW_CONFIG,
    });
    // 600 / 1.85 ≈ 325, strictly less than the solo 600.
    expect(res.revisedElapsedMinutes).toBeLessThan(600);
    expect(res.revisedElapsedMinutes).toBe(Math.ceil(600 / 1.85));
  });

  it("is not eligible when the member already checked in (claim returns nothing)", async () => {
    handler = (text) => {
      if (text.includes("UPDATE booking_crew_assignments") && text.includes("status = 'NO_SHOW'")) return [];
      return [];
    };
    const res = await handleNoShow(makeSql(), {
      bookingId: "bk", assignmentId: "member-seat", config: DEFAULT_CREW_CONFIG,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not_eligible");
  });
});

// ── Crew-aware completion ────────────────────────────────────────────────────
const LEAD = { id: "lead-seat", booking_id: "bk", cleaner_id: "cl-lead", role: "LEAD",
  seat_index: 0, status: "ACCEPTED", person_minutes: 300, earnings_cents: 0,
  check_in_at: "2026-08-29T10:00:00Z", check_out_at: null, vouched_by_assignment_id: null };
const MEMBER_PRESENT = { id: "m1", booking_id: "bk", cleaner_id: "cl-m1", role: "MEMBER",
  seat_index: 1, status: "ACCEPTED", person_minutes: 300, earnings_cents: 0,
  check_in_at: "2026-08-29T10:05:00Z", check_out_at: null, vouched_by_assignment_id: null };
const MEMBER_ABSENT = { ...MEMBER_PRESENT, id: "m2", cleaner_id: "cl-m2", seat_index: 2, check_in_at: null };
const MEMBER_NOSHOW = { ...MEMBER_ABSENT, id: "m3", cleaner_id: "cl-m3", seat_index: 3, status: "NO_SHOW" };

describe("completeCrewBooking — LEAD-only, validates all seats", () => {
  it("the LEAD completes all present seats; NO_SHOW seats are left as-is", async () => {
    let seatsCompleted = false;
    let crewCompleted = false;
    handler = (text) => {
      if (text.includes("FROM booking_crew_assignments") && text.includes("ORDER BY seat_index")) {
        return [LEAD, MEMBER_PRESENT, MEMBER_NOSHOW];
      }
      if (text.includes("UPDATE booking_crew_assignments") && text.includes("status = 'COMPLETED'")) {
        seatsCompleted = true;
        return [{ id: "lead-seat" }, { id: "m1" }];
      }
      if (text.includes("UPDATE bookings") && text.includes("crew_status = 'COMPLETED'")) {
        crewCompleted = true;
        return [];
      }
      return [];
    };
    const res = await completeCrewBooking(makeSql(), { bookingId: "bk", callerCleanerId: "cl-lead" });
    expect(res.ok).toBe(true);
    expect(seatsCompleted).toBe(true);
    expect(crewCompleted).toBe(true);
    expect(res.completedSeats).toBe(2);
    expect(res.noShowSeats).toBe(1);
  });

  it("a member cannot complete the booking (not_lead), and no seats are touched", async () => {
    let anyUpdate = false;
    handler = (text) => {
      if (text.includes("FROM booking_crew_assignments") && text.includes("ORDER BY seat_index")) {
        return [LEAD, MEMBER_PRESENT];
      }
      if (text.includes("UPDATE")) { anyUpdate = true; return []; }
      return [];
    };
    const res = await completeCrewBooking(makeSql(), { bookingId: "bk", callerCleanerId: "cl-m1" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not_lead");
    expect(anyUpdate).toBe(false); // premature/unauthorized action completes nothing
  });

  it("blocks completion while a member's attendance is unresolved (ACCEPTED, never checked in)", async () => {
    let anyUpdate = false;
    handler = (text) => {
      if (text.includes("FROM booking_crew_assignments") && text.includes("ORDER BY seat_index")) {
        return [LEAD, MEMBER_ABSENT];
      }
      if (text.includes("UPDATE")) { anyUpdate = true; return []; }
      return [];
    };
    const res = await completeCrewBooking(makeSql(), { bookingId: "bk", callerCleanerId: "cl-lead" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("unresolved_attendance");
    expect(res.unresolvedSeatIds).toEqual(["m2"]);
    expect(anyUpdate).toBe(false);
  });

  it("returns no_lead when the crew has no LEAD seat", async () => {
    handler = (text) => {
      if (text.includes("FROM booking_crew_assignments") && text.includes("ORDER BY seat_index")) {
        return [MEMBER_PRESENT];
      }
      return [];
    };
    const res = await completeCrewBooking(makeSql(), { bookingId: "bk", callerCleanerId: "cl-lead" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("no_lead");
  });
});
