/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { getUserByClerkId, getCustomerByUserId, getCleanerByUserId } from "@sweepr/db";
import { sanitizeText } from "../lib/sanitizeText";
import { isTeamFlagEnabled } from "../lib/crew/crewConfig";
import { shouldPromptPeerRating, submitPeerRating } from "../lib/crew/crewPeerRating";
import type { AppBindings } from "../types";

export const reviewsRouter = new Hono<AppBindings>();

const createSchema = z.object({
  bookingId: z.string().uuid(),
  cleanerId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  tags: z
    .array(
      z.enum(["on_time", "thorough", "communication", "spotless", "friendly"])
    )
    .max(5)
    .default([]),
});

reviewsRouter.post(
  "/",
  requireAuth,
  zValidator("json", createSchema),
  async (c) => {
    const input = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);

    const user = await getUserByClerkId(sql, c.get("user").clerkId);
    if (!user) return c.json({ error: "Forbidden" }, 403);
    const customer = await getCustomerByUserId(sql, user.id);
    if (!customer) return c.json({ error: "Forbidden" }, 403);

    const bookingRows = (await sql`
      SELECT id, customer_id, cleaner_id, status, completed_at, crew_status FROM bookings WHERE id = ${input.bookingId} LIMIT 1
    `) as Array<{ id: string; customer_id: string; cleaner_id: string | null; status: string; completed_at: string | null; crew_status: string | null }>;
    const booking = bookingRows[0];
    if (!booking) return c.json({ error: "Booking not found" }, 404);
    if (booking.customer_id !== customer.id) return c.json({ error: "Forbidden" }, 403);
    if (booking.status !== "completed") {
      return c.json({ error: "Booking must be completed before it can be reviewed" }, 409);
    }
    // Reviews (create or edit) are only allowed within 3 days of completion.
    const REVIEW_WINDOW_DAYS = 3;
    if (booking.completed_at) {
      const ageMs = Date.now() - new Date(booking.completed_at).getTime();
      if (ageMs > REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
        return c.json(
          { error: "review_window_closed", message: `Reviews can only be left or edited within ${REVIEW_WINDOW_DAYS} days of the service` },
          400,
        );
      }
    }

    // Who can be the rating target. Solo: only booking.cleaner_id (unchanged).
    // Crew: any cleaner who performed the booking — the customer can rate each
    // member, and rating the LEAD (bookings.cleaner_id) is the booking-overall
    // rating. Admin reads which cleaners performed via booking_crew_assignments.
    const isCrew = !!booking.crew_status && (await isTeamFlagEnabled(sql, "enabled"));
    if (isCrew) {
      const seat = (await sql`
        SELECT 1 FROM booking_crew_assignments
        WHERE booking_id = ${input.bookingId} AND cleaner_id = ${input.cleanerId}
          AND status IN ('ACCEPTED', 'COMPLETED')
        LIMIT 1
      `) as Array<unknown>;
      if (!seat[0]) {
        return c.json({ error: "cleanerId did not perform this booking" }, 400);
      }
    } else if (booking.cleaner_id !== input.cleanerId) {
      return c.json({ error: "cleanerId does not match this booking" }, 400);
    }

    const comment = input.comment ? sanitizeText(input.comment, 2000) : null;
    // Upsert on the per-member key so each crew member carries their own rating
    // (solo = one member = one row per booking, exactly as before).
    const rows = (await sql`
      INSERT INTO reviews (booking_id, customer_id, cleaner_id, rating, comment, tags)
      VALUES (${input.bookingId}, ${customer.id}, ${input.cleanerId}, ${input.rating}, ${comment}, ${input.tags})
      ON CONFLICT (booking_id, cleaner_id) DO UPDATE
        SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, tags = EXCLUDED.tags
      RETURNING *
    `) as unknown[];
    return c.json({ review: rows[0] }, 201);
  }
);

// ─── Crew peer ratings (cleaner-to-cleaner thumbs up/down) ──────────────────
// Gated on the Team Cleans flag. The rater is ALWAYS the signed-in cleaner —
// never a client-supplied id — and no other cleaner's private data is exposed.

/** Should the signed-in cleaner be prompted to rate a teammate on a booking? */
reviewsRouter.get("/peer/prompt", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  if (!(await isTeamFlagEnabled(sql, "enabled"))) return c.json({ prompt: false });

  const bookingId = c.req.query("bookingId");
  const rateeCleanerId = c.req.query("rateeCleanerId");
  if (!bookingId || !rateeCleanerId) return c.json({ error: "bookingId and rateeCleanerId are required" }, 400);

  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "Forbidden" }, 403);
  const cleaner = await getCleanerByUserId(sql, user.id);
  if (!cleaner) return c.json({ error: "Forbidden" }, 403);

  const result = await shouldPromptPeerRating(sql, bookingId, cleaner.id, rateeCleanerId);
  return c.json(result);
});

const peerSchema = z.object({
  bookingId: z.string().uuid(),
  rateeCleanerId: z.string().uuid(),
  thumbs: z.enum(["up", "down"]),
  comment: z.string().max(2000).optional(),
});

/** Submit a peer thumbs up/down about a teammate on a shared booking. */
reviewsRouter.post("/peer", requireAuth, zValidator("json", peerSchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  if (!(await isTeamFlagEnabled(sql, "enabled"))) {
    return c.json({ error: "Peer ratings are not enabled" }, 403);
  }

  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "Forbidden" }, 403);
  const cleaner = await getCleanerByUserId(sql, user.id);
  if (!cleaner) return c.json({ error: "Forbidden" }, 403);

  const comment = input.comment ? sanitizeText(input.comment, 2000) : null;
  const result = await submitPeerRating(sql, {
    bookingId: input.bookingId,
    raterCleanerId: cleaner.id,
    rateeCleanerId: input.rateeCleanerId,
    thumbs: input.thumbs,
    comment,
  });

  if (!result.ok) {
    const status = result.code === "ALREADY_RATED" || result.code === "NOT_FIRST" ? 409 : 400;
    return c.json({ error: result.code }, status);
  }
  return c.json({ ok: true, id: result.id }, 201);
});

reviewsRouter.get("/cleaner/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  // Expose only public-safe fields — never customer_id or internal IDs.
  const reviews = (await sql`
    SELECT id, cleaner_id, rating, comment, tags, created_at
    FROM reviews WHERE cleaner_id = ${c.req.param("id")}
    ORDER BY created_at DESC
    LIMIT 100
  `) as unknown[];
  return c.json({ reviews });
});
