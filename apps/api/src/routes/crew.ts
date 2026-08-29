/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

// MOUNT: in apps/api/src/index.ts add `import { crewRouter } from "./routes/crew";`
//        and mount it with `app.route("/", crewRouter);` (routes are absolute:
//        /bookings/:id/crew, /crew/*). Also wire crewStaffing.expireStaleCrewInvitations(sql)
//        into the cron in index.ts alongside processExpiredOffers, and call
//        crewStaffing.planAndStartStaffing(sql, bookingId) from the payment-captured
//        assignment kickoff in routes/bookings.ts / stripe-webhook.ts INSTEAD of
//        initiateAssignment when Team Cleans is enabled (planAndStartStaffing itself
//        falls back to initiateAssignment for solo / flag-off).

/**
 * Team Cleans crew API — staffing state, invitations, and the concurrency-safe
 * accept path. Cleaner actions (accept/decline) require the caller to BE the
 * cleaner; admin actions (invite/replace/remove/change-lead/recalculate) require
 * an admin. Everything is inert unless the Team Cleans flag is enabled — reads
 * still work for solo bookings (they simply have no crew rows).
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { audit } from "../lib/audit";
import type { AppBindings } from "../types";
import {
  getCrewSeats,
  getSeat,
  acceptSeat,
  declineSeat,
  cancelSeat,
  type AcceptFailure,
} from "../lib/crew/crewAssignment";
import {
  planAndStartStaffing,
  dispatchStaffing,
  afterSeatAccepted,
  afterSeatDeclined,
  handleMemberDrop,
  recomputeAndPersistCrewStatus,
} from "../lib/crew/crewStaffing";

export const crewRouter = new Hono<AppBindings>();

crewRouter.use("*", requireAuth);

/** Resolve the cleaner id for the authenticated user, or null if not a cleaner. */
async function currentCleanerId(sql: ReturnType<typeof getDb>, clerkId: string): Promise<string | null> {
  const users = (await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`) as Array<{ id: string }>;
  if (!users[0]) return null;
  const cleaners = (await sql`SELECT id FROM cleaners WHERE user_id = ${users[0].id} LIMIT 1`) as Array<{
    id: string;
  }>;
  return cleaners[0]?.id ?? null;
}

/** Map an accept-path failure reason to an HTTP status + message. */
function acceptFailureResponse(reason: AcceptFailure): { status: 400 | 403 | 404 | 409; error: string } {
  switch (reason) {
    case "seat_not_found":
    case "booking_not_found":
      return { status: 404, error: "Crew seat not found" };
    case "position_filled":
      return { status: 409, error: "This position has already been filled" };
    case "not_invited":
      return { status: 403, error: "You do not have an open invitation for this seat" };
    case "already_on_crew":
      return { status: 409, error: "You already hold a seat on this booking" };
    case "insurance_required":
      return { status: 403, error: "Valid insurance is required before accepting jobs" };
    case "inactive":
      return { status: 403, error: "Your account is not eligible to accept jobs" };
    case "conflict":
      return { status: 409, error: "You have a conflicting booking around this time" };
    case "out_of_area":
      return { status: 403, error: "This job is outside your service area or offerings" };
    default:
      return { status: 400, error: "Unable to accept this seat" };
  }
}

// ── GET /bookings/:id/crew ────────────────────────────────────────────────────
crewRouter.get("/bookings/:id/crew", async (c) => {
  const bookingId = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT id, crew_status, required_crew_size, min_crew_size, target_crew_size,
           crew_assignment_version, extra_cleaner_requested
    FROM bookings WHERE id = ${bookingId} LIMIT 1
  `) as Array<{
    id: string;
    crew_status: string | null;
    required_crew_size: number | null;
    min_crew_size: number | null;
    target_crew_size: number | null;
    crew_assignment_version: number | null;
    extra_cleaner_requested: boolean | null;
  }>;
  if (!rows[0]) return c.json({ error: "Booking not found" }, 404);
  const seats = await getCrewSeats(sql, bookingId);
  return c.json({
    booking: {
      id: rows[0].id,
      crewStatus: rows[0].crew_status,
      requiredCrewSize: rows[0].required_crew_size,
      minCrewSize: rows[0].min_crew_size,
      targetCrewSize: rows[0].target_crew_size,
      crewAssignmentVersion: rows[0].crew_assignment_version,
      extraCleanerRequested: rows[0].extra_cleaner_requested ?? false,
    },
    seats,
  });
});

// ── POST /bookings/:id/crew/recalculate (admin) ──────────────────────────────
// Plan + start staffing for a booking that has no crew yet, or recompute the
// crew_status of one that already does.
crewRouter.post("/bookings/:id/crew/recalculate", requireAdmin, async (c) => {
  const bookingId = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);
  const existing = await getCrewSeats(sql, bookingId);
  const result = existing.length === 0
    ? await planAndStartStaffing(sql, bookingId)
    : { mode: "crew" as const, crewStatus: await recomputeAndPersistCrewStatus(sql, bookingId) };
  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "booking",
    targetId: bookingId,
    metadata: { crew: "recalculate", result },
    timestamp: new Date().toISOString(),
  });
  return c.json({ ok: true, result });
});

// ── POST /crew/invite (admin) — kick/resume staffing dispatch ────────────────
crewRouter.post(
  "/crew/invite",
  requireAdmin,
  zValidator("json", z.object({ bookingId: z.string().uuid() })),
  async (c) => {
    const { bookingId } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const crewStatus = await dispatchStaffing(sql, bookingId);
    if (crewStatus == null) return c.json({ error: "Booking has no crew to staff" }, 400);
    await audit(sql, {
      action: "admin.action",
      actorClerkId: c.get("user").clerkId,
      targetType: "booking",
      targetId: bookingId,
      metadata: { crew: "invite", crewStatus },
      timestamp: new Date().toISOString(),
    });
    return c.json({ ok: true, crewStatus });
  },
);

// ── POST /crew/:assignment/accept (cleaner) ──────────────────────────────────
crewRouter.post("/crew/:assignment/accept", async (c) => {
  const seatId = c.req.param("assignment");
  const sql = getDb(c.env.DATABASE_URL);
  const cleanerId = await currentCleanerId(sql, c.get("user").clerkId);
  if (!cleanerId) return c.json({ error: "Only cleaners can accept crew seats" }, 403);

  const result = await acceptSeat(sql, seatId, cleanerId);
  if (!result.ok) {
    const { status, error } = acceptFailureResponse(result.reason ?? "position_filled");
    return c.json({ error, reason: result.reason }, status);
  }
  // Advance the staffing state machine (also kicks off member staffing on a
  // LEAD accept). Never let a post-accept step fail the accept response.
  try {
    if (result.seat) await afterSeatAccepted(sql, result.seat.bookingId, result.seat);
  } catch {
    /* state recompute is best-effort; the seat is safely claimed */
  }
  return c.json({ ok: true, role: result.role, seat: result.seat });
});

// ── POST /crew/:assignment/decline (cleaner) ─────────────────────────────────
crewRouter.post("/crew/:assignment/decline", async (c) => {
  const seatId = c.req.param("assignment");
  const sql = getDb(c.env.DATABASE_URL);
  const cleanerId = await currentCleanerId(sql, c.get("user").clerkId);
  if (!cleanerId) return c.json({ error: "Only cleaners can decline crew seats" }, 403);

  const result = await declineSeat(sql, seatId, cleanerId);
  if (!result.ok) return c.json({ error: "No open invitation to decline for this seat" }, 409);
  try {
    await afterSeatDeclined(sql, seatId, result.waveExhausted);
  } catch {
    /* cascade is best-effort */
  }
  return c.json({ ok: true });
});

// ── POST /crew/:assignment/replace (admin) — drop occupant + re-staff seat ────
crewRouter.post("/crew/:assignment/replace", requireAdmin, async (c) => {
  const seatId = c.req.param("assignment");
  const sql = getDb(c.env.DATABASE_URL);
  const cur = await getSeat(sql, seatId);
  if (!cur) return c.json({ error: "Crew seat not found" }, 404);
  await handleMemberDrop(sql, seatId, "REMOVED");
  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "booking",
    targetId: cur.seat.bookingId,
    metadata: { crew: "replace", seatId, seatIndex: cur.seat.seatIndex, role: cur.seat.role },
    timestamp: new Date().toISOString(),
  });
  return c.json({ ok: true });
});

// ── DELETE /crew/:assignment (admin) — remove a seat ─────────────────────────
crewRouter.delete("/crew/:assignment", requireAdmin, async (c) => {
  const seatId = c.req.param("assignment");
  const sql = getDb(c.env.DATABASE_URL);
  const cur = await getSeat(sql, seatId);
  if (!cur) return c.json({ error: "Crew seat not found" }, 404);
  await cancelSeat(sql, seatId, "REMOVED");
  await recomputeAndPersistCrewStatus(sql, cur.seat.bookingId);
  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "booking",
    targetId: cur.seat.bookingId,
    metadata: { crew: "remove_seat", seatId, seatIndex: cur.seat.seatIndex },
    timestamp: new Date().toISOString(),
  });
  return c.json({ ok: true });
});

// ── POST /crew/change-lead (admin) — release the lead seat + re-staff it ──────
crewRouter.post(
  "/crew/change-lead",
  requireAdmin,
  zValidator("json", z.object({ bookingId: z.string().uuid() })),
  async (c) => {
    const { bookingId } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const seats = await getCrewSeats(sql, bookingId);
    const leadSeat = seats.find((s) => s.role === "LEAD");
    if (!leadSeat) return c.json({ error: "Booking has no lead seat" }, 400);
    // Drop the current lead and re-open the lead search (preserves members).
    await handleMemberDrop(sql, leadSeat.id, "REMOVED");
    await audit(sql, {
      action: "admin.action",
      actorClerkId: c.get("user").clerkId,
      targetType: "booking",
      targetId: bookingId,
      metadata: { crew: "change_lead", seatId: leadSeat.id },
      timestamp: new Date().toISOString(),
    });
    return c.json({ ok: true });
  },
);
