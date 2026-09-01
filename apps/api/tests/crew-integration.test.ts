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
 * Team Cleans — INTEGRATION flows (spec §63-66).
 *
 * These exercise the crew engine end-to-end at the SERVICE layer: the real
 * crewStaffing state machine + crewAssignment seat CRUD + crewPayout split run
 * against an in-memory store modeling `bookings` + `booking_crew_assignments`
 * (the makeSql() template-tag mock, docs/team-cleans-audit.md §12). Only the
 * pure matching engine (crewMatching) and heavy collaborators (Stripe,
 * notifications, insurance, the solo matcher) are mocked, so a whole flow —
 * size → invite → accept → CONFIRMED → drop → replace → complete → pay — is
 * driven through the same functions the routes call.
 *
 * Route orchestration (accept→afterSeatAccepted, decline→afterSeatDeclined) is
 * reproduced by the routeAccept/routeDecline helpers below, matching
 * routes/crew.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Sql } from "@sweepr/db";

// ── Heavy collaborators mocked; the crew state machine + seat CRUD run for real ──
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
  recomputeAndPersistCrewStatus,
  handleMemberDrop,
} from "../src/lib/crew/crewStaffing";
import { handleNoShow, completeCrewBooking } from "../src/lib/crew/crewDayOfService";
import {
  splitPoolCents,
  computeCrewEarnings,
  releaseCrewPayouts,
} from "../src/lib/crew/crewPayout";
import { DEFAULT_CREW_CONFIG, payoutSplitFractions } from "../src/lib/crew/crewConfig";

// ── In-memory store: bookings + booking_crew_assignments ──────────────────────
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
  total_price: number | null;
  founding_customer_discount_cents: number | null;
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
/** person-minutes returned by the v2 quote lookup for this booking. */
let personMinutes = 700;
/** quote-result snapshot returned by the v2 quote lookup (carries requiredTeamSize). */
let quoteResult: unknown = null;

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

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
    check_in_at: o.check_in_at ?? null,
    check_out_at: o.check_out_at ?? null,
    vouched_by_assignment_id: o.vouched_by_assignment_id ?? null,
    stripe_transfer_id: o.stripe_transfer_id ?? null,
    crew_assignment_version: o.crew_assignment_version ?? 1,
  };
}

function candidateScores(ids: string[]) {
  return ids.map((id) => ({ cleanerId: id, score: 50, baseScore: 50, breakdown: { base: 50 } }));
}

function handler(text: string, values: unknown[]): unknown {
  // ── site_settings: feature flags ON, crew_config → defaults ──
  if (text.includes("FROM site_settings")) {
    const key = String(values[0] ?? "");
    if (key.startsWith("team_")) return [{ value: "true" }];
    return [];
  }
  if (text.includes("FROM users WHERE role = 'admin'")) return [];
  if (text.includes("FROM customers c JOIN users u")) return [];

  // ── v2 labor-context lookup (planAndStartStaffing → loadBookingLaborContext) ──
  if (text.includes("FROM pricing_quotes_v2")) {
    return [{ expected_labor_minutes: personMinutes, result: quoteResult, config: null }];
  }
  if (text.includes("FROM pricing_versions")) {
    return [{ config: null }];
  }

  // ── cleaners (revalidate on accept, tier/connect for payout) ──
  if (text.includes("stripe_connect_id FROM cleaners")) {
    return [{ stripe_connect_id: `acct_${String(values[0])}` }];
  }
  if (text.includes("tier FROM cleaners")) return [{ tier: "standard" }];
  if (text.includes("FROM cleaners WHERE id =")) {
    return [{ id: values[0], status: "active", user_id: `u-${values[0]}`, tier: "standard", total_jobs: 10, rating: "4.5" }];
  }
  if (text.includes("FROM platform_fee_settings")) return []; // → default 30%
  if (text.includes("founding_member")) return [{ founding_member: false, founding_member_revoked: false }];
  if (text.includes("FROM cleaner_tier_multipliers")) return []; // → 1.0

  // ── bookings ──
  if (text.trim().startsWith("SELECT") && text.includes("FROM bookings")) return [clone(booking)];
  if (text.includes("UPDATE bookings")) {
    if (text.includes("required_crew_size =") && text.includes("crew_status =")) {
      booking.required_crew_size = values[0] as number;
      booking.target_crew_size = values[1] as number;
      booking.min_crew_size = values[2] as number;
      booking.crew_status = "NEEDS_STAFFING";
    } else if (text.includes("crew_status = 'AT_RISK'")) {
      if (booking.crew_status !== null) booking.crew_status = "AT_RISK";
    } else if (text.includes("crew_status = 'COMPLETED'")) {
      if (booking.crew_status !== null) booking.crew_status = "COMPLETED";
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
    // held-seat check (SELECT 1)
    if (text.includes("SELECT 1")) {
      const [bid, cid] = values as [string, string];
      const hit = seats.find(
        (s) => s.booking_id === bid && s.cleaner_id === cid && (s.status === "ACCEPTED" || s.status === "COMPLETED"),
      );
      return hit ? [{ "?column?": 1 }] : [];
    }
    // present-seat aggregate for no-show recompute
    if (text.includes("FILTER (WHERE status IN ('ACCEPTED', 'COMPLETED'))")) {
      const bid = values[0] as string;
      const rows = seats.filter((s) => s.booking_id === bid);
      const present = rows.filter((s) => s.status === "ACCEPTED" || s.status === "COMPLETED").length;
      const total_pm = rows.reduce((sum, s) => sum + (s.person_minutes ?? 0), 0);
      return [{ present, total_pm }];
    }
    // present-seat reads (payout + earnings) use the distinctive `id, cleaner_id,
    // role` projection — getSeat/getCrewSeats use `id, booking_id, cleaner_id`.
    if (text.includes("SELECT id, cleaner_id, role")) {
      const bid = values[0] as string;
      const present = seats
        .filter((s) => s.booking_id === bid && s.cleaner_id && ["ACCEPTED", "COMPLETED"].includes(s.status))
        .sort((a, b) => (a.role === "LEAD" ? -1 : b.role === "LEAD" ? 1 : a.seat_index - b.seat_index));
      if (text.includes("stripe_transfer_id")) return present.map(clone); // releaseCrewPayouts
      return present.map((s) => ({ id: s.id, cleaner_id: s.cleaner_id, role: s.role, seat_index: s.seat_index, status: s.status }));
    }
    // completeCrewBooking: all seats ORDER BY seat_index (has full column list)
    if (text.includes("ORDER BY seat_index") && text.includes("check_in_at")) {
      const bid = values[0] as string;
      return seats.filter((s) => s.booking_id === bid).sort((a, b) => a.seat_index - b.seat_index).map(clone);
    }
    // currentLeadCleanerId
    if (text.includes("SELECT cleaner_id") && text.includes("role = 'LEAD'")) {
      const bid = values[0] as string;
      const lead = seats.find(
        (s) => s.booking_id === bid && s.role === "LEAD" && s.cleaner_id && ["ACCEPTED", "COMPLETED"].includes(s.status),
      );
      return lead ? [{ cleaner_id: lead.cleaner_id }] : [];
    }
    // seatedCleanerIds
    if (text.includes("SELECT cleaner_id")) {
      const bid = values[0] as string;
      return seats
        .filter((s) => s.booking_id === bid && s.cleaner_id && ["INVITED", "ACCEPTED", "COMPLETED"].includes(s.status))
        .map((s) => ({ cleaner_id: s.cleaner_id }));
    }
    // expiry scan
    if (text.includes("WHERE status = 'INVITED'") && text.includes("expires_at < NOW()")) {
      const now = Date.now();
      return seats
        .filter((s) => s.status === "INVITED" && s.expires_at && new Date(s.expires_at).getTime() < now)
        .map((s) => ({ id: s.id, booking_id: s.booking_id }));
    }
    // getCrewSeats / getSeat
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
    // accept claim
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
    // release for replacement (version bump + score_breakdown NULL)
    if (text.includes("SET status = 'CANDIDATE'") && text.includes("crew_assignment_version =")) {
      const id = values[1] as string;
      const s = seats.find((x) => x.id === id);
      if (s) {
        s.status = "CANDIDATE";
        s.cleaner_id = null;
        s.score_breakdown = null;
        s.offered_at = null;
        s.expires_at = null;
        s.responded_at = null;
        s.assignment_score = null;
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
    // no-show claim
    if (text.includes("status = 'NO_SHOW'")) {
      const id = values[0] as string;
      const s = seats.find((x) => x.id === id);
      if (s && s.status === "ACCEPTED" && s.check_in_at == null) {
        s.status = "NO_SHOW";
        s.earnings_cents = 0;
        return [{ id }];
      }
      return [];
    }
    // completeCrewBooking: mark present seats COMPLETED
    if (text.includes("status = 'COMPLETED'")) {
      const bid = values[0] as string;
      const changed = seats.filter(
        (s) => s.booking_id === bid && s.status === "ACCEPTED" && s.check_in_at != null,
      );
      for (const s of changed) {
        s.status = "COMPLETED";
        s.check_out_at = s.check_out_at ?? (values[1] as string);
      }
      return changed.map((s) => ({ id: s.id }));
    }
    // earnings write
    if (text.includes("earnings_cents =")) {
      const earnings = values[0] as number;
      const id = values[1] as string;
      const s = seats.find((x) => x.id === id);
      if (s) s.earnings_cents = earnings;
      return [];
    }
    // transfer claim / finalize (stripe_transfer_id)
    if (text.includes("stripe_transfer_id =")) {
      const id = values[values.length - 1] as string;
      const s = seats.find((x) => x.id === id);
      if (text.includes("stripe_transfer_id IS NULL")) {
        // claim: only when currently NULL
        if (s && s.stripe_transfer_id == null) {
          s.stripe_transfer_id = values[0] as string; // sentinel
          return [{ id }];
        }
        return [];
      }
      if (s) s.stripe_transfer_id = values[0] as string;
      return [{ id }];
    }
    // decline (score_breakdown only)
    if (text.includes("SET score_breakdown =") && !text.includes("SET status")) {
      const id = values[1] as string;
      const s = seats.find((x) => x.id === id);
      if (s && s.status === "INVITED") s.score_breakdown = JSON.parse(values[0] as string);
      return [];
    }
    // check-in claim
    if (text.includes("check_in_at =")) {
      const now = values[0] as string;
      const id = values[2] as string;
      const s = seats.find((x) => x.id === id);
      if (s && s.status === "ACCEPTED" && s.check_in_at == null) {
        s.check_in_at = now;
        s.vouched_by_assignment_id = (values[1] as string) ?? null;
        return [clone(s)];
      }
      return [];
    }
    // generic setSeatStatus/cancel
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

const sqlCalls: string[] = [];
function makeSql(): Sql {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    sqlCalls.push(text);
    return Promise.resolve(handler(text, values) ?? []);
  }) as unknown as Sql;
}

let sql: Sql;

// ── Route orchestration mirrors (routes/crew.ts) ──────────────────────────────
async function routeAccept(seatId: string, cleanerId: string) {
  const result = await acceptSeat(sql, seatId, cleanerId);
  if (result.ok && result.seat) await afterSeatAccepted(sql, result.seat.bookingId, result.seat);
  return result;
}
async function routeDecline(seatId: string, cleanerId: string) {
  const result = await declineSeat(sql, seatId, cleanerId);
  if (result.ok) await afterSeatDeclined(sql, seatId, result.waveExhausted);
  return result;
}

function seatAt(index: number): SeatRec {
  return seats.find((s) => s.seat_index === index)!;
}
function invitedIds(index: number): string[] {
  return (seatAt(index).score_breakdown as { crew: { invited: string[] } }).crew.invited;
}

beforeEach(() => {
  seats = [];
  seatSeq = 0;
  personMinutes = 700;
  quoteResult = null;
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
    total_price: null,
    founding_customer_discount_cents: 0,
    pricing_version_id: "ver-1",
    pricing_quote_v2_id: "q-1",
    extra_cleaner_requested: false,
    crew_status: null,
    required_crew_size: null,
    min_crew_size: 1,
    target_crew_size: null,
    crew_assignment_version: 1,
  };
  sql = makeSql();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. Solo regression — the single-cleaner path is untouched.
// ════════════════════════════════════════════════════════════════════════════
describe("solo booking still works end to end (regression)", () => {
  it("flag OFF → delegates to initiateAssignment, no crew rows, crew_status NULL", async () => {
    sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      if (text.includes("FROM site_settings")) return Promise.resolve([{ value: "false" }]);
      return Promise.resolve(handler(text, values) ?? []);
    }) as unknown as Sql;

    const res = await planAndStartStaffing(sql, booking.id);
    expect(res.mode).toBe("solo");
    expect(res.reason).toBe("flag_off");
    expect(vi.mocked(initiateAssignment)).toHaveBeenCalledWith(sql, booking.id);
    expect(seats).toHaveLength(0);
    expect(booking.crew_status).toBeNull();
  });

  it("flag ON but labor sizes to 1 → solo single-seat path", async () => {
    personMinutes = 120; // well under the 1-person band → size 1
    const res = await planAndStartStaffing(sql, booking.id);
    expect(res.mode).toBe("solo");
    expect(vi.mocked(initiateAssignment)).toHaveBeenCalledWith(sql, booking.id);
    expect(seats).toHaveLength(0);
    expect(booking.crew_status).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 & 3. Full staffing flows: size → lead accept → member invite → accept → CONFIRMED.
// ════════════════════════════════════════════════════════════════════════════
describe("2-person staffing flow → CONFIRMED", () => {
  it("plans a crew of 2, invites+accepts the lead, then the member, ending CONFIRMED", async () => {
    personMinutes = 700; // → size 2 under default bands
    vi.mocked(rankLeadCandidates).mockResolvedValue(candidateScores(["L1", "L2"]));
    vi.mocked(rankCrewCandidates).mockResolvedValue(candidateScores(["M1", "M2"]));

    const res = await planAndStartStaffing(sql, booking.id);
    expect(res.mode).toBe("crew");
    expect(res.requiredCrewSize).toBe(2);
    expect(res.crewStatus).toBe("STAFFING");
    expect(seats).toHaveLength(2);
    expect(seatAt(0).role).toBe("LEAD");
    expect(seatAt(0).status).toBe("INVITED");

    // Lead accepts → PARTIALLY_STAFFED, member seat auto-invited, compat pointer set.
    const leadAccept = await routeAccept(seatAt(0).id, "L1");
    expect(leadAccept.ok).toBe(true);
    expect(booking.cleaner_id).toBe("L1");
    expect(booking.status).toBe("cleaner_accepted");
    expect(booking.crew_status).toBe("PARTIALLY_STAFFED");
    expect(seatAt(1).status).toBe("INVITED");
    expect(invitedIds(1)).toEqual(["M1", "M2"]);

    // Member accepts → CONFIRMED.
    const memAccept = await routeAccept(seatAt(1).id, "M1");
    expect(memAccept.ok).toBe(true);
    expect(booking.crew_status).toBe("CONFIRMED");
  });
});

describe("3-person staffing flow → CONFIRMED", () => {
  it("fills LEAD + 2 MEMBER seats to CONFIRMED", async () => {
    personMinutes = 1000; // → size 3
    vi.mocked(rankLeadCandidates).mockResolvedValue(candidateScores(["L1"]));
    vi.mocked(rankCrewCandidates).mockResolvedValue(candidateScores(["M1", "M2", "M3", "M4"]));

    const res = await planAndStartStaffing(sql, booking.id);
    expect(res.requiredCrewSize).toBe(3);
    expect(seats).toHaveLength(3);

    await routeAccept(seatAt(0).id, "L1");
    expect(booking.crew_status).toBe("PARTIALLY_STAFFED");
    // Two open member seats each got a disjoint wave.
    expect(seatAt(1).status).toBe("INVITED");
    expect(seatAt(2).status).toBe("INVITED");

    await routeAccept(seatAt(1).id, invitedIds(1)[0]);
    expect(booking.crew_status).toBe("PARTIALLY_STAFFED"); // still one seat open
    await routeAccept(seatAt(2).id, invitedIds(2)[0]);
    expect(booking.crew_status).toBe("CONFIRMED");

    const accepted = seats.filter((s) => s.status === "ACCEPTED");
    expect(accepted).toHaveLength(3);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3b. Engine staffing contract: the quote's requiredTeamSize is consumed.
// ════════════════════════════════════════════════════════════════════════════
describe("quote requiredTeamSize drives crew size (engine staffing contract)", () => {
  it("a low-labor airbnb quote requiring a team of 3 staffs 3 seats", async () => {
    personMinutes = 200; // labor alone would size to 1
    quoteResult = { requiredTeamSize: 3 }; // staffing matrix + turnover window said 3
    booking.service_type = "vacation_rental";
    vi.mocked(rankLeadCandidates).mockResolvedValue(candidateScores(["L1"]));
    vi.mocked(rankCrewCandidates).mockResolvedValue(candidateScores(["M1", "M2", "M3"]));

    const res = await planAndStartStaffing(sql, booking.id);
    expect(res.mode).toBe("crew");
    expect(res.requiredCrewSize).toBe(3);
    expect(seats).toHaveLength(3);
    expect(booking.required_crew_size).toBe(3);
  });

  it("requiredTeamSize 1 leaves a small job solo", async () => {
    personMinutes = 200;
    quoteResult = { requiredTeamSize: 1 };
    const res = await planAndStartStaffing(sql, booking.id);
    expect(res.mode).toBe("solo");
    expect(seats).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Lead declines → next candidate.
// ════════════════════════════════════════════════════════════════════════════
describe("lead declines → cascade to next lead candidate", () => {
  it("a fully-declined lead wave re-invites the next lead candidate", async () => {
    booking.required_crew_size = 2;
    booking.crew_status = "STAFFING";
    const lead = makeSeat({
      role: "LEAD",
      seat_index: 0,
      status: "INVITED",
      crew_assignment_version: 2,
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      score_breakdown: { crew: { wave: 2, invited: ["L1"], declined: [], contacted: ["L1"] } },
    });
    seats = [lead, makeSeat({ role: "MEMBER", seat_index: 1, status: "CANDIDATE" })];
    vi.mocked(rankLeadCandidates).mockResolvedValue(candidateScores(["L2"]));

    const dec = await routeDecline(lead.id, "L1");
    expect(dec.ok).toBe(true);
    expect(dec.waveExhausted).toBe(true);

    // Lead seat re-opened and re-invited to L2; the whole crew is not torn down.
    expect(seatAt(0).status).toBe("INVITED");
    expect(invitedIds(0)).toEqual(["L2"]);
    // L1 is excluded from the re-rank (already contacted).
    const excl = new Set(vi.mocked(rankLeadCandidates).mock.calls.at(-1)?.[2]?.excludeCleanerIds ?? []);
    expect(excl.has("L1")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. Member declines → fallthrough to the next member candidate.
// ════════════════════════════════════════════════════════════════════════════
describe("member declines → fallthrough", () => {
  it("a partial decline keeps waiting; a full-wave decline cascades", async () => {
    booking.required_crew_size = 2;
    booking.crew_status = "PARTIALLY_STAFFED";
    const member = makeSeat({
      role: "MEMBER",
      seat_index: 1,
      status: "INVITED",
      crew_assignment_version: 2,
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      score_breakdown: { crew: { wave: 2, invited: ["a", "b"], declined: [], contacted: ["a", "b"] } },
    });
    seats = [makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L" }), member];
    vi.mocked(rankCrewCandidates).mockResolvedValue(candidateScores(["c"]));

    // First decline (a): partner b still outstanding → no cascade.
    const d1 = await routeDecline(member.id, "a");
    expect(d1.waveExhausted).toBe(false);
    expect(seatAt(1).status).toBe("INVITED");
    expect(vi.mocked(rankCrewCandidates)).not.toHaveBeenCalled();

    // Second decline (b): wave exhausted → cascade to c.
    const d2 = await routeDecline(member.id, "b");
    expect(d2.waveExhausted).toBe(true);
    expect(seatAt(1).status).toBe("INVITED");
    expect(invitedIds(1)).toEqual(["c"]);
    expect(vi.mocked(rankCrewCandidates)).toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. Invitation expiry cascade.
// ════════════════════════════════════════════════════════════════════════════
describe("invitation expiry cascade", () => {
  it("an expired member invitation is freed and re-offered to the next candidate", async () => {
    const { expireStaleCrewInvitations } = await import("../src/lib/crew/crewStaffing");
    booking.required_crew_size = 2;
    booking.crew_status = "PARTIALLY_STAFFED";
    const member = makeSeat({
      role: "MEMBER",
      seat_index: 1,
      status: "INVITED",
      crew_assignment_version: 2,
      expires_at: new Date(Date.now() - 60_000).toISOString(), // already lapsed
      score_breakdown: { crew: { wave: 2, invited: ["a"], declined: [], contacted: ["a"] } },
    });
    seats = [makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L" }), member];
    vi.mocked(rankCrewCandidates).mockResolvedValue(candidateScores(["e"]));

    await expireStaleCrewInvitations(sql);

    expect(seatAt(1).status).toBe("INVITED");
    expect(invitedIds(1)).toEqual(["e"]);
  });

  it("expiry with an exhausted pool → STAFFING_FAILED (crew not shrunk)", async () => {
    const { expireStaleCrewInvitations } = await import("../src/lib/crew/crewStaffing");
    booking.required_crew_size = 2;
    booking.crew_status = "PARTIALLY_STAFFED";
    const member = makeSeat({
      role: "MEMBER",
      seat_index: 1,
      status: "INVITED",
      crew_assignment_version: 2,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      score_breakdown: { crew: { wave: 2, invited: ["a"], declined: [], contacted: ["a"] } },
    });
    seats = [makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L" }), member];
    vi.mocked(rankCrewCandidates).mockResolvedValue([]);

    await expireStaleCrewInvitations(sql);
    expect(booking.crew_status).toBe("STAFFING_FAILED");
    expect(seats).toHaveLength(2);
    expect(seatAt(1).cleaner_id).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. Two cleaners race the final seat — exactly one wins.
// ════════════════════════════════════════════════════════════════════════════
describe("two cleaners race the final seat", () => {
  it("concurrent accepts on one open seat: exactly one wins, the other gets position_filled", async () => {
    booking.required_crew_size = 2;
    booking.crew_status = "PARTIALLY_STAFFED";
    const member = makeSeat({
      role: "MEMBER",
      seat_index: 1,
      status: "INVITED",
      crew_assignment_version: 2,
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      score_breakdown: { crew: { wave: 2, invited: ["X", "Y"], declined: [], contacted: ["X", "Y"] } },
    });
    seats = [makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L" }), member];

    const [a, b] = await Promise.all([acceptSeat(sql, member.id, "X"), acceptSeat(sql, member.id, "Y")]);
    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].reason).toBe("position_filled");
    expect(seatAt(1).status).toBe("ACCEPTED");
    expect(["X", "Y"]).toContain(seatAt(1).cleaner_id);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. Member cancel after CONFIRMED → AT_RISK + replacement (crew preserved).
// ════════════════════════════════════════════════════════════════════════════
describe("member cancel after confirm → AT_RISK + replacement", () => {
  it("re-staffs only the vacated seat and keeps the rest of the crew", async () => {
    booking.required_crew_size = 3;
    booking.crew_status = "CONFIRMED";
    booking.cleaner_id = "L";
    const dropping = makeSeat({ role: "MEMBER", seat_index: 1, status: "ACCEPTED", cleaner_id: "M1" });
    seats = [
      makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L" }),
      dropping,
      makeSeat({ role: "MEMBER", seat_index: 2, status: "ACCEPTED", cleaner_id: "M2" }),
    ];
    vi.mocked(rankCrewCandidates).mockResolvedValue(candidateScores(["R"]));

    await handleMemberDrop(sql, dropping.id, "CANCELLED");

    expect(booking.crew_status).toBe("AT_RISK");
    expect(seatAt(1).status).toBe("INVITED");
    expect(invitedIds(1)).toEqual(["R"]);
    // Lead and other member untouched — no teardown.
    expect(seatAt(0).status).toBe("ACCEPTED");
    expect(seatAt(2).status).toBe("ACCEPTED");
    expect(seatAt(2).cleaner_id).toBe("M2");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. No-show → NO_SHOW + reduced-crew recompute + zero pay.
// ════════════════════════════════════════════════════════════════════════════
describe("no-show → NO_SHOW + reduced-crew recompute + zero pay", () => {
  it("marks NO_SHOW (zero pay), sets AT_RISK, recomputes elapsed, and excludes the seat from the split", async () => {
    booking.crew_status = "CONFIRMED";
    booking.cleaner_id = "L";
    booking.total_price = 7500; // pool = 5250¢ after default 30% fee
    seats = [
      makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L", person_minutes: 350, check_in_at: new Date().toISOString() }),
      makeSeat({ role: "MEMBER", seat_index: 1, status: "ACCEPTED", cleaner_id: "M1", person_minutes: 350 }),
    ];

    const noShow = await handleNoShow(sql, {
      bookingId: booking.id,
      assignmentId: seatAt(1).id,
      config: DEFAULT_CREW_CONFIG,
    });
    expect(noShow.ok).toBe(true);
    expect(seatAt(1).status).toBe("NO_SHOW");
    expect(seatAt(1).earnings_cents).toBe(0);
    expect(booking.crew_status).toBe("AT_RISK");
    expect(noShow.presentCrewSize).toBe(1);
    expect(noShow.personMinutes).toBe(700); // total labor unchanged by the no-show
    expect(noShow.revisedElapsedMinutes).toBe(700); // solo capacity 1.0 for 700 person-min

    // The no-show is excluded from the pool split: the lone present lead earns the whole pool.
    const earnings = await computeCrewEarnings(sql, booking.id);
    expect(earnings.presentCrewSize).toBe(1);
    expect(earnings.poolCents).toBe(5250);
    expect(earnings.seats[0].cleanerId).toBe("L");
    expect(earnings.seats[0].earningsCents).toBe(5250);
    expect(seatAt(1).earnings_cents).toBe(0); // no-show still zero
  });

  it("3-person crew: a no-show recomputes for the two remaining and they split 54/46", async () => {
    booking.crew_status = "CONFIRMED";
    booking.cleaner_id = "L";
    booking.total_price = 10000; // pool = 7000¢ after default 30% fee
    seats = [
      makeSeat({ role: "LEAD", seat_index: 0, status: "ACCEPTED", cleaner_id: "L", person_minutes: 300, check_in_at: new Date().toISOString() }),
      makeSeat({ role: "MEMBER", seat_index: 1, status: "ACCEPTED", cleaner_id: "M1", person_minutes: 300, check_in_at: new Date().toISOString() }),
      makeSeat({ role: "MEMBER", seat_index: 2, status: "ACCEPTED", cleaner_id: "M2", person_minutes: 300 }),
    ];

    const noShow = await handleNoShow(sql, {
      bookingId: booking.id,
      assignmentId: seatAt(2).id,
      config: DEFAULT_CREW_CONFIG,
    });
    expect(noShow.ok).toBe(true);
    expect(noShow.presentCrewSize).toBe(2);
    expect(noShow.personMinutes).toBe(900); // total labor unchanged
    // Two remaining cleaners at the fallback curve (2 → 1800 permille).
    expect(noShow.revisedElapsedMinutes).toBe(Math.ceil(900 / 1.8));

    // The two present seats split the SAME pool 54/46; the no-show earns 0.
    const earnings = await computeCrewEarnings(sql, booking.id);
    expect(earnings.presentCrewSize).toBe(2);
    expect(earnings.poolCents).toBe(7000);
    expect(earnings.seats.map((s) => s.earningsCents)).toEqual([3780, 3220]);
    expect(seatAt(2).earnings_cents).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. Payout split 54/46 and 36/32/32, one transfer per present member.
// ════════════════════════════════════════════════════════════════════════════
describe("payout split 54/46 and 36/32/32", () => {
  it("54/46 two-person: split written per seat + one transfer each", async () => {
    booking.cleaner_id = "cl-lead";
    booking.total_price = 7500; // pool 5250¢
    seats = [
      makeSeat({ role: "LEAD", seat_index: 0, status: "COMPLETED", cleaner_id: "cl-lead" }),
      makeSeat({ role: "MEMBER", seat_index: 1, status: "COMPLETED", cleaner_id: "cl-mem" }),
    ];

    const earnings = await computeCrewEarnings(sql, booking.id);
    expect(earnings.poolCents).toBe(5250);
    expect(earnings.seats.map((s) => s.earningsCents)).toEqual([2835, 2415]);

    const created: Array<{ params: Record<string, unknown>; opts: { idempotencyKey: string } }> = [];
    const stripe = {
      transfers: {
        create: vi.fn(async (params: Record<string, unknown>, o: { idempotencyKey: string }) => {
          created.push({ params, opts: o });
          return { id: `tr_${created.length}` };
        }),
      },
    } as unknown as import("stripe").default;

    const summary = await releaseCrewPayouts(sql, stripe, booking.id);
    expect(summary.allSucceeded).toBe(true);
    expect(created.map((c) => c.params.amount)).toEqual([2835, 2415]);
    expect(new Set(created.map((c) => c.opts.idempotencyKey)).size).toBe(2);
    expect(created.every((c) => c.params.transfer_group === `booking_${booking.id}`)).toBe(true);
  });

  it("36/32/32 three-person: pool split conserved exactly", async () => {
    booking.cleaner_id = "cl-lead";
    booking.total_price = 12500; // pool 8750¢
    seats = [
      makeSeat({ role: "LEAD", seat_index: 0, status: "COMPLETED", cleaner_id: "cl-lead" }),
      makeSeat({ role: "MEMBER", seat_index: 1, status: "COMPLETED", cleaner_id: "cl-m1" }),
      makeSeat({ role: "MEMBER", seat_index: 2, status: "COMPLETED", cleaner_id: "cl-m2" }),
    ];
    const earnings = await computeCrewEarnings(sql, booking.id);
    expect(earnings.poolCents).toBe(8750);
    expect(earnings.seats.map((s) => s.earningsCents)).toEqual([3150, 2800, 2800]);
    expect(earnings.seats.reduce((sum, s) => sum + s.earningsCents, 0)).toBe(8750);
  });

  it("split fractions come from crew config (primary first, sum to 1)", () => {
    expect(payoutSplitFractions(DEFAULT_CREW_CONFIG, 2)).toEqual([0.54, 0.46]);
    expect(payoutSplitFractions(DEFAULT_CREW_CONFIG, 3)).toEqual([0.36, 0.32, 0.32]);
    expect(splitPoolCents(6000, [0.54, 0.46])).toEqual([3240, 2760]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 11. Migration backfill maps an existing solo booking to one LEAD seat.
// ════════════════════════════════════════════════════════════════════════════
describe("migration 101 backfill: solo booking → one LEAD seat", () => {
  /**
   * Pure replication of the backfill SELECT→INSERT in
   * packages/db/src/migrations/101_team_cleans.sql: every booking with a
   * cleaner becomes exactly one LEAD seat at seat_index 0, ACCEPTED (or
   * COMPLETED for completed bookings), earnings mirroring cleaner_payout, and
   * crew_status left NULL so the booking keeps behaving as solo/legacy.
   */
  function backfillLeadSeat(b: {
    id: string;
    cleaner_id: string | null;
    status: string;
    cleaner_payout: number | null;
    started_at: string | null;
    completed_at: string | null;
  }) {
    if (b.cleaner_id == null) return null;
    return {
      booking_id: b.id,
      cleaner_id: b.cleaner_id,
      role: "LEAD" as const,
      seat_index: 0,
      status: b.status === "completed" ? "COMPLETED" : "ACCEPTED",
      earnings_cents: b.cleaner_payout ?? 0,
      check_in_at: b.started_at,
      check_out_at: b.completed_at,
    };
  }

  it("an in-flight solo booking backfills to one ACCEPTED LEAD seat", () => {
    const seat = backfillLeadSeat({
      id: "b1",
      cleaner_id: "cl-1",
      status: "confirmed",
      cleaner_payout: 5000,
      started_at: null,
      completed_at: null,
    });
    expect(seat).toEqual({
      booking_id: "b1",
      cleaner_id: "cl-1",
      role: "LEAD",
      seat_index: 0,
      status: "ACCEPTED",
      earnings_cents: 5000,
      check_in_at: null,
      check_out_at: null,
    });
  });

  it("a completed solo booking backfills to a COMPLETED LEAD seat with timestamps", () => {
    const seat = backfillLeadSeat({
      id: "b2",
      cleaner_id: "cl-2",
      status: "completed",
      cleaner_payout: 4200,
      started_at: "2026-01-01T10:00:00Z",
      completed_at: "2026-01-01T13:00:00Z",
    });
    expect(seat?.status).toBe("COMPLETED");
    expect(seat?.check_in_at).toBe("2026-01-01T10:00:00Z");
    expect(seat?.check_out_at).toBe("2026-01-01T13:00:00Z");
  });

  it("a backfilled solo LEAD is a valid degenerate crew of one: it earns the whole pool", async () => {
    booking.cleaner_id = "cl-1";
    booking.total_price = 7500; // pool 5250¢
    booking.crew_status = null; // stays solo/legacy
    seats = [makeSeat({ role: "LEAD", seat_index: 0, status: "COMPLETED", cleaner_id: "cl-1" })];

    const earnings = await computeCrewEarnings(sql, booking.id);
    expect(earnings.presentCrewSize).toBe(1);
    expect(earnings.poolCents).toBe(5250);
    expect(earnings.seats[0].earningsCents).toBe(5250); // 100% to the lead
  });

  it("a booking with no cleaner is not backfilled", () => {
    expect(backfillLeadSeat({ id: "b3", cleaner_id: null, status: "matching", cleaner_payout: null, started_at: null, completed_at: null })).toBeNull();
  });
});
