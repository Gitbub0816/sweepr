/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Sql } from "@sweepr/db";

// ── Heavy collaborators are mocked; the crew state machine + seat CRUD run for real ──
vi.mock("../src/lib/notifications", () => ({ sendNotification: vi.fn(async () => {}) }));
vi.mock("../src/lib/assignment", () => ({ initiateAssignment: vi.fn(async () => {}) }));
vi.mock("../src/lib/cleanerRequirements", () => ({
  checkInsurance: vi.fn(async () => ({ valid: true, reason: "ok" })),
}));
vi.mock("../src/lib/matching", () => ({
  eligibleCleanersForBooking: vi.fn(async (_b: unknown, c: Array<{ id: string }>) => c),
  rankCleanersForBooking: vi.fn(async (_b: unknown, c: Array<{ id: string }>) =>
    c.map((x) => ({ cleanerId: x.id, score: 50, breakdown: {} })),
  ),
}));
vi.mock("../src/lib/crew/crewMatching", () => ({
  rankLeadCandidates: vi.fn(async () => []),
  rankCrewCandidates: vi.fn(async () => []),
}));

import { initiateAssignment } from "../src/lib/assignment";
import { rankLeadCandidates, rankCrewCandidates } from "../src/lib/crew/crewMatching";
import { acceptSeat, declineSeat, getCrewSeats } from "../src/lib/crew/crewAssignment";
import {
  planAndStartStaffing,
  afterSeatAccepted,
  afterSeatDeclined,
  handleMemberDrop,
  staffMemberSeats,
  expireStaleCrewInvitations,
  recomputeAndPersistCrewStatus,
} from "../src/lib/crew/crewStaffing";

// ── In-memory store modeling bookings + booking_crew_assignments ──────────────
interface SeatRec {
  id: string;
  booking_id: string;
  cleaner_id: string | null;
  role: "LEAD" | "MEMBER";
  seat_index: number;
  status: string;
  person_minutes: number | null;
  assignment_score: number | null;
  score_breakdown: unknown;
  earnings_cents: number;
  offered_at: string | null;
  expires_at: string | null;
  responded_at: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  vouched_by_assignment_id: string | null;
  stripe_transfer_id: string | null;
  crew_assignment_version: number;
}

interface BookingRec {
  id: string;
  customer_id: string | null;
  cleaner_id: string | null;
  status: string;
  service_type: string;
  scheduled_at: string | null;
  address_id: string | null;
  pricing_version_id: string | null;
  pricing_quote_v2_id: string | null;
  extra_cleaner_requested: boolean;
  crew_status: string | null;
  required_crew_size: number | null;
  min_crew_size: number;
  target_crew_size: number | null;
  crew_assignment_version: number;
}

let seats: SeatRec[] = [];
let booking: BookingRec;
let seatSeq = 0;

function makeSeat(o: Partial<SeatRec> & { role: "LEAD" | "MEMBER"; seat_index: number }): SeatRec {
  return {
    id: o.id ?? `seat-${++seatSeq}`,
    booking_id: o.booking_id ?? booking.id,
    cleaner_id: o.cleaner_id ?? null,
    role: o.role,
    seat_index: o.seat_index,
    status: o.status ?? "CANDIDATE",
    person_minutes: o.person_minutes ?? null,
    assignment_score: o.assignment_score ?? null,
    score_breakdown: o.score_breakdown ?? null,
    earnings_cents: o.earnings_cents ?? 0,
    offered_at: o.offered_at ?? null,
    expires_at: o.expires_at ?? null,
    responded_at: o.responded_at ?? null,
    check_in_at: null,
    check_out_at: null,
    vouched_by_assignment_id: null,
    stripe_transfer_id: null,
    crew_assignment_version: o.crew_assignment_version ?? 1,
  };
}

function invitedSeat(role: "LEAD" | "MEMBER", index: number, invited: string[], version = 2): SeatRec {
  return makeSeat({
    role,
    seat_index: index,
    status: "INVITED",
    offered_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    crew_assignment_version: version,
    score_breakdown: { crew: { wave: version, invited, declined: [], contacted: invited } },
  });
}

function handler(text: string, values: unknown[]): unknown {
  // ── site_settings (feature flags + crew_config) ──
  if (text.includes("FROM site_settings")) {
    const key = String(values[0] ?? "");
    if (key.startsWith("team_")) return [{ value: "true" }];
    return []; // crew_config absent → defaults
  }
  if (text.includes("FROM users WHERE role = 'admin'")) return [];
  if (text.includes("FROM customers c JOIN users u")) return [];
  if (text.includes("FROM cleaners WHERE id =")) {
    return [{ id: values[0], status: "active", user_id: `u-${values[0]}`, tier: "preferred", total_jobs: 10, rating: "4.5" }];
  }

  // ── bookings ──
  if (text.trim().startsWith("SELECT") && text.includes("FROM bookings")) return [booking];
  if (text.includes("UPDATE bookings")) {
    if (text.includes("required_crew_size =") && text.includes("crew_status =")) {
      booking.required_crew_size = values[0] as number;
      booking.target_crew_size = values[1] as number;
      booking.min_crew_size = values[2] as number;
      booking.crew_status = "NEEDS_STAFFING";
    } else if (text.includes("SET crew_status =")) {
      booking.crew_status = values[0] as string;
    } else if (text.includes("SET cleaner_id = NULL")) {
      booking.cleaner_id = null;
    } else if (text.includes("cleaner_id =") && text.includes("status = 'cleaner_accepted'")) {
      booking.cleaner_id = values[0] as string;
      booking.status = "cleaner_accepted";
    }
    return [];
  }

  // ── booking_crew_assignments ──
  if (text.includes("INSERT INTO booking_crew_assignments")) {
    const [bid, role, idx, pm, ver] = values as [string, "LEAD" | "MEMBER", number, number | null, number];
    if (!seats.some((s) => s.booking_id === bid && s.seat_index === idx)) {
      seats.push(makeSeat({ booking_id: bid, role, seat_index: idx, person_minutes: pm, crew_assignment_version: ver }));
    }
    return [];
  }
  if (text.includes("FROM booking_crew_assignments")) {
    if (text.includes("SELECT 1")) {
      const [bid, cid] = values as [string, string];
      const hit = seats.find(
        (s) => s.booking_id === bid && s.cleaner_id === cid && (s.status === "ACCEPTED" || s.status === "COMPLETED"),
      );
      return hit ? [{ "?column?": 1 }] : [];
    }
    if (text.includes("SELECT cleaner_id")) {
      if (text.includes("role = 'LEAD'")) {
        const bid = values[0] as string;
        const lead = seats.find(
          (s) => s.booking_id === bid && s.role === "LEAD" && s.cleaner_id && ["ACCEPTED", "COMPLETED"].includes(s.status),
        );
        return lead ? [{ cleaner_id: lead.cleaner_id }] : [];
      }
      const bid = values[0] as string;
      return seats
        .filter((s) => s.booking_id === bid && s.cleaner_id && ["INVITED", "ACCEPTED", "COMPLETED"].includes(s.status))
        .map((s) => ({ cleaner_id: s.cleaner_id }));
    }
    if (text.includes("WHERE status = 'INVITED'") && text.includes("expires_at < NOW()")) {
      const now = Date.now();
      return seats
        .filter((s) => s.status === "INVITED" && s.expires_at && new Date(s.expires_at).getTime() < now)
        .map((s) => ({ id: s.id, booking_id: s.booking_id }));
    }
    // getSeat / getCrewSeats
    if (text.includes("ORDER BY seat_index")) {
      const bid = values[0] as string;
      return seats.filter((s) => s.booking_id === bid).sort((a, b) => a.seat_index - b.seat_index).map(clone);
    }
    if (text.includes("WHERE id =")) {
      const id = values[0] as string;
      const s = seats.find((x) => x.id === id);
      return s ? [clone(s)] : [];
    }
  }
  if (text.includes("UPDATE booking_crew_assignments")) {
    // claim (accept)
    if (text.includes("SET status = 'ACCEPTED'")) {
      const cleanerId = values[0] as string;
      const id = values[3] as string;
      const version = values[4] as number;
      const s = seats.find((x) => x.id === id);
      if (s && s.status === "INVITED" && s.cleaner_id == null && s.crew_assignment_version === version) {
        s.status = "ACCEPTED";
        s.cleaner_id = cleanerId;
        s.assignment_score = (values[1] as number) ?? null;
        s.responded_at = new Date().toISOString();
        return [{ id }];
      }
      return [];
    }
    // invite
    if (text.includes("SET status = 'INVITED'")) {
      const id = values[3] as string;
      const s = seats.find((x) => x.id === id);
      if (s && (s.status === "CANDIDATE" || s.status === "INVITED")) {
        s.status = "INVITED";
        s.cleaner_id = null;
        s.expires_at = values[0] as string;
        s.crew_assignment_version = values[1] as number;
        s.score_breakdown = JSON.parse(values[2] as string);
        return [{ id }];
      }
      return [];
    }
    // release for replacement (has version bump + score_breakdown NULL)
    if (text.includes("SET status = 'CANDIDATE'") && text.includes("crew_assignment_version =")) {
      const id = values[1] as string;
      const s = seats.find((x) => x.id === id);
      if (s) {
        s.status = "CANDIDATE";
        s.cleaner_id = null;
        s.score_breakdown = null;
        s.offered_at = null;
        s.expires_at = null;
        s.crew_assignment_version = values[0] as number;
        return [{ id }];
      }
      return [];
    }
    // expire invitation
    if (text.includes("SET status = 'CANDIDATE'")) {
      const id = values[0] as string;
      const s = seats.find((x) => x.id === id);
      if (s && s.status === "INVITED") {
        s.status = "CANDIDATE";
        s.cleaner_id = null;
        s.offered_at = null;
        s.expires_at = null;
        return [{ id }];
      }
      return [];
    }
    // decline (score_breakdown only)
    if (text.includes("SET score_breakdown =") && !text.includes("SET status")) {
      const id = values[1] as string;
      const s = seats.find((x) => x.id === id);
      if (s && s.status === "INVITED") s.score_breakdown = JSON.parse(values[0] as string);
      return [];
    }
    // cancel/setSeatStatus (param status)
    {
      const status = values[0] as string;
      const id = values[1] as string;
      const s = seats.find((x) => x.id === id);
      if (s) s.status = status;
      return [];
    }
  }

  return [];
}

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

const sqlCalls: string[] = [];
function makeSql(): Sql {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    sqlCalls.push(text);
    return Promise.resolve(handler(text, values) ?? []);
  }) as unknown as Sql;
}

let sql: Sql;

beforeEach(() => {
  seats = [];
  seatSeq = 0;
  sqlCalls.length = 0;
  vi.clearAllMocks();
  booking = {
    id: "bk-1",
    customer_id: "cust-1",
    cleaner_id: null,
    status: "booked",
    service_type: "standard",
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
    address_id: "addr-1",
    pricing_version_id: null,
    pricing_quote_v2_id: null,
    extra_cleaner_requested: false,
    crew_status: null,
    required_crew_size: null,
    min_crew_size: 1,
    target_crew_size: null,
    crew_assignment_version: 1,
  };
  sql = makeSql();
});

describe("crew concurrency — the last seat", () => {
  it("two cleaners accepting the same open MEMBER seat: exactly one wins", async () => {
    const seat = invitedSeat("MEMBER", 1, ["X", "Y"], 2);
    seats = [makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L" }), seat];

    const [a, b] = await Promise.all([acceptSeat(sql, seat.id, "X"), acceptSeat(sql, seat.id, "Y")]);

    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].reason).toBe("position_filled");
    // The seat ends ACCEPTED by exactly one of them.
    expect(seat.status).toBe("ACCEPTED");
    expect(["X", "Y"]).toContain(seat.cleaner_id);
  });

  it("rejects a cleaner who was never invited to the seat", async () => {
    const seat = invitedSeat("MEMBER", 1, ["X"], 2);
    seats = [makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L" }), seat];
    const res = await acceptSeat(sql, seat.id, "Z");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not_invited");
  });

  it("LEAD accept also claims bookings.cleaner_id (compat pointer)", async () => {
    const seat = invitedSeat("LEAD", 0, ["L"], 2);
    seats = [seat];
    const res = await acceptSeat(sql, seat.id, "L");
    expect(res.ok).toBe(true);
    expect(booking.cleaner_id).toBe("L");
    expect(booking.status).toBe("cleaner_accepted");
  });
});

describe("decline cascades to the next candidate", () => {
  it("a fully-declined wave frees the seat and invites the next candidate", async () => {
    booking.required_crew_size = 3;
    booking.crew_status = "PARTIALLY_STAFFED";
    const member = invitedSeat("MEMBER", 1, ["a", "b"], 2);
    member.score_breakdown = { crew: { wave: 2, invited: ["a", "b"], declined: ["a"], contacted: ["a", "b"] } };
    seats = [
      makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L" }),
      member,
      makeSeat({ role: "MEMBER", seat_index: 2, status: "ACCEPTED", cleaner_id: "c" }),
    ];
    vi.mocked(rankCrewCandidates).mockResolvedValue([{ cleanerId: "d", score: 60, baseScore: 50, breakdown: { base: 50 } }]);

    // The last outstanding invitee (b) declines → wave exhausted → cascade.
    const dec = await declineSeat(sql, member.id, "b");
    expect(dec.ok).toBe(true);
    expect(dec.waveExhausted).toBe(true);

    await afterSeatDeclined(sql, member.id, dec.waveExhausted);

    // Seat 1 is re-invited to the next candidate 'd'; the accepted members remain.
    const seat1 = seats.find((s) => s.seat_index === 1)!;
    expect(seat1.status).toBe("INVITED");
    expect((seat1.score_breakdown as { crew: { invited: string[] } }).crew.invited).toEqual(["d"]);
    expect(vi.mocked(rankCrewCandidates)).toHaveBeenCalled();
    // Excludes already-contacted (a,b) and seated (L,c).
    const excl = vi.mocked(rankCrewCandidates).mock.calls[0][4]?.excludeCleanerIds;
    const exclSet = new Set(excl ?? []);
    for (const id of ["a", "b", "L", "c"]) expect(exclSet.has(id)).toBe(true);
  });

  it("a partial decline (invitees still outstanding) does not cascade", async () => {
    const member = invitedSeat("MEMBER", 1, ["a", "b"], 2);
    seats = [makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L" }), member];
    const dec = await declineSeat(sql, member.id, "a");
    expect(dec.waveExhausted).toBe(false);
    await afterSeatDeclined(sql, member.id, dec.waveExhausted);
    expect(seats.find((s) => s.seat_index === 1)!.status).toBe("INVITED");
    expect(vi.mocked(rankCrewCandidates)).not.toHaveBeenCalled();
  });
});

describe("invitation expiry cascades", () => {
  it("an expired member invitation is freed and re-offered to the next candidate", async () => {
    booking.required_crew_size = 2;
    booking.crew_status = "PARTIALLY_STAFFED";
    const member = invitedSeat("MEMBER", 1, ["a"], 2);
    member.expires_at = new Date(Date.now() - 60_000).toISOString(); // already expired
    seats = [makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L" }), member];
    vi.mocked(rankCrewCandidates).mockResolvedValue([{ cleanerId: "e", score: 55, baseScore: 50, breakdown: { base: 50 } }]);

    await expireStaleCrewInvitations(sql);

    const seat1 = seats.find((s) => s.seat_index === 1)!;
    expect(seat1.status).toBe("INVITED");
    expect((seat1.score_breakdown as { crew: { invited: string[] } }).crew.invited).toEqual(["e"]);
  });
});

describe("member drop after CONFIRMED → AT_RISK + replacement (no teardown)", () => {
  it("re-staffs only the vacated seat and preserves the rest of the crew", async () => {
    booking.required_crew_size = 3;
    booking.crew_status = "CONFIRMED";
    booking.cleaner_id = "L";
    const dropping = makeSeat({ role: "MEMBER", seat_index: 1, status: "ACCEPTED", cleaner_id: "M1" });
    seats = [
      makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L" }),
      dropping,
      makeSeat({ role: "MEMBER", seat_index: 2, status: "ACCEPTED", cleaner_id: "M2" }),
    ];
    vi.mocked(rankCrewCandidates).mockResolvedValue([{ cleanerId: "R", score: 58, baseScore: 50, breakdown: { base: 50 } }]);

    await handleMemberDrop(sql, dropping.id, "CANCELLED");

    expect(booking.crew_status).toBe("AT_RISK");
    // Vacated seat re-opened and re-invited to the replacement.
    const seat1 = seats.find((s) => s.seat_index === 1)!;
    expect(seat1.status).toBe("INVITED");
    expect((seat1.score_breakdown as { crew: { invited: string[] } }).crew.invited).toEqual(["R"]);
    // The lead and the OTHER member are untouched — crew is not torn down.
    expect(seats.find((s) => s.seat_index === 0)!.status).toBe("ACCEPTED");
    expect(seats.find((s) => s.seat_index === 2)!.status).toBe("ACCEPTED");
    expect(seats.find((s) => s.seat_index === 2)!.cleaner_id).toBe("M2");
  });
});

describe("STAFFING_FAILED when candidates are exhausted", () => {
  it("marks the booking STAFFING_FAILED rather than shrinking the crew", async () => {
    booking.required_crew_size = 2;
    booking.crew_status = "PARTIALLY_STAFFED";
    const member = invitedSeat("MEMBER", 1, ["a"], 2);
    member.expires_at = new Date(Date.now() - 60_000).toISOString();
    seats = [makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L" }), member];
    vi.mocked(rankCrewCandidates).mockResolvedValue([]); // pool exhausted

    await expireStaleCrewInvitations(sql);

    expect(booking.crew_status).toBe("STAFFING_FAILED");
    // The crew was not silently reduced: the seat still exists (now open), unfilled.
    expect(seats).toHaveLength(2);
    expect(seats.find((s) => s.seat_index === 1)!.cleaner_id).toBeNull();
  });
});

describe("lead accept drives member staffing, then CONFIRMED", () => {
  it("PARTIALLY_STAFFED on lead accept, CONFIRMED once all seats accept", async () => {
    booking.required_crew_size = 2;
    booking.crew_status = "STAFFING";
    const lead = makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L" });
    const member = makeSeat({ role: "MEMBER", seat_index: 1, status: "CANDIDATE" });
    seats = [lead, member];
    vi.mocked(rankCrewCandidates).mockResolvedValue([{ cleanerId: "m1", score: 55, baseScore: 50, breakdown: { base: 50 } }]);

    const leadSeat = (await getCrewSeats(sql, booking.id)).find((s) => s.role === "LEAD")!;
    await afterSeatAccepted(sql, booking.id, leadSeat);

    expect(booking.crew_status).toBe("PARTIALLY_STAFFED");
    expect(seats.find((s) => s.seat_index === 1)!.status).toBe("INVITED");

    // Member accepts → recompute → CONFIRMED.
    seats.find((s) => s.seat_index === 1)!.status = "ACCEPTED";
    seats.find((s) => s.seat_index === 1)!.cleaner_id = "m1";
    const status = await recomputeAndPersistCrewStatus(sql, booking.id);
    expect(status).toBe("CONFIRMED");
    expect(booking.crew_status).toBe("CONFIRMED");
  });

  it("staffMemberSeats gives each open seat a disjoint candidate wave", async () => {
    booking.required_crew_size = 3;
    seats = [
      makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L" }),
      makeSeat({ role: "MEMBER", seat_index: 1, status: "CANDIDATE" }),
      makeSeat({ role: "MEMBER", seat_index: 2, status: "CANDIDATE" }),
    ];
    // 6 candidates, parallelInvitationCount=3 → seat1 gets first 3, seat2 next 3.
    vi.mocked(rankCrewCandidates).mockResolvedValue(
      ["c1", "c2", "c3", "c4", "c5", "c6"].map((id) => ({ cleanerId: id, score: 50, baseScore: 50, breakdown: { base: 50 } })),
    );
    await staffMemberSeats(sql, booking.id, "L");
    const s1 = seats.find((s) => s.seat_index === 1)!;
    const s2 = seats.find((s) => s.seat_index === 2)!;
    expect((s1.score_breakdown as { crew: { invited: string[] } }).crew.invited).toEqual(["c1", "c2", "c3"]);
    expect((s2.score_breakdown as { crew: { invited: string[] } }).crew.invited).toEqual(["c4", "c5", "c6"]);
  });
});

describe("solo path stays unchanged", () => {
  it("flag OFF → delegates to initiateAssignment, no crew rows", async () => {
    // Flag defaults OFF: force site_settings to return non-'true'.
    sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      if (text.includes("FROM site_settings")) return Promise.resolve([{ value: "false" }]);
      return Promise.resolve(handler(text, values) ?? []);
    }) as unknown as Sql;
    const res = await planAndStartStaffing(sql, booking.id);
    expect(res.mode).toBe("solo");
    expect(vi.mocked(initiateAssignment)).toHaveBeenCalledWith(sql, booking.id);
    expect(seats).toHaveLength(0);
  });

  it("flag ON but no v2 person-minutes → sizing stays solo, single-seat path", async () => {
    booking.pricing_version_id = null; // no labor estimate → computeCrewPlan size 1
    const res = await planAndStartStaffing(sql, booking.id);
    expect(res.mode).toBe("solo");
    expect(vi.mocked(initiateAssignment)).toHaveBeenCalledWith(sql, booking.id);
    expect(seats).toHaveLength(0);
    expect(booking.crew_status).toBeNull();
  });
});
