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
 * Crew peer ratings — a cleaner's private "would I work with them again" thumbs
 * up/down about another cleaner they shared a booking with. Collected ONLY on a
 * pair's FIRST shared booking: the crew_peer_ratings UNIQUE(rater, ratee) makes
 * one rating per ordered pair, ever, and we never prompt again once the pair has
 * worked together. This is distinct from customer reviews and is never exposed
 * to the other cleaner (no private data leaves this module).
 */

import type { Sql } from "@sweepr/db";

/** Seat statuses that count as "shared a booking" (present together). */
const PRESENT = ["ACCEPTED", "COMPLETED"] as const;
const PRESENT_ARR = PRESENT as unknown as string[];

/** Do two cleaners both hold a present seat on the given booking? */
export async function sharedThisBooking(
  sql: Sql,
  bookingId: string,
  cleanerA: string,
  cleanerB: string,
): Promise<boolean> {
  if (cleanerA === cleanerB) return false;
  const rows = (await sql`
    SELECT cleaner_id FROM booking_crew_assignments
    WHERE booking_id = ${bookingId}
      AND cleaner_id = ANY(${[cleanerA, cleanerB]})
      AND status = ANY(${PRESENT_ARR})
  `) as Array<{ cleaner_id: string }>;
  const set = new Set(rows.map((r) => r.cleaner_id));
  return set.has(cleanerA) && set.has(cleanerB);
}

/**
 * Have the two cleaners shared any booking OTHER than `exceptBookingId`? Used to
 * tell whether `bookingId` is their FIRST pairing (prompt only on the first).
 */
export async function sharedAnotherBooking(
  sql: Sql,
  cleanerA: string,
  cleanerB: string,
  exceptBookingId: string,
): Promise<boolean> {
  if (cleanerA === cleanerB) return false;
  const rows = (await sql`
    SELECT a.booking_id
    FROM booking_crew_assignments a
    JOIN booking_crew_assignments b
      ON b.booking_id = a.booking_id AND b.cleaner_id = ${cleanerB}
      AND b.status = ANY(${PRESENT_ARR})
    WHERE a.cleaner_id = ${cleanerA}
      AND a.status = ANY(${PRESENT_ARR})
      AND a.booking_id <> ${exceptBookingId}
    LIMIT 1
  `) as Array<{ booking_id: string }>;
  return rows.length > 0;
}

/** Has this ordered pair already been rated (one rating per pair, ever)? */
export async function alreadyRated(
  sql: Sql,
  raterCleanerId: string,
  rateeCleanerId: string,
): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 FROM crew_peer_ratings
    WHERE rater_cleaner_id = ${raterCleanerId} AND ratee_cleaner_id = ${rateeCleanerId}
    LIMIT 1
  `) as Array<unknown>;
  return rows.length > 0;
}

export interface PeerPrompt {
  /** True only when the rater should be asked to rate this ratee now. */
  prompt: boolean;
  alreadyRated: boolean;
  /** They have worked together before this booking (so it is not their first). */
  sharedBefore: boolean;
}

/**
 * Whether to prompt `rater` to rate `ratee` on `bookingId`: only when they share
 * THIS booking, have never rated this pair, and have NOT worked together before
 * (this is their first pairing). Returns booleans only — no private data.
 */
export async function shouldPromptPeerRating(
  sql: Sql,
  bookingId: string,
  raterCleanerId: string,
  rateeCleanerId: string,
): Promise<PeerPrompt> {
  if (raterCleanerId === rateeCleanerId) {
    return { prompt: false, alreadyRated: false, sharedBefore: false };
  }
  const onThisBooking = await sharedThisBooking(sql, bookingId, raterCleanerId, rateeCleanerId);
  if (!onThisBooking) return { prompt: false, alreadyRated: false, sharedBefore: false };

  const rated = await alreadyRated(sql, raterCleanerId, rateeCleanerId);
  const sharedBefore = await sharedAnotherBooking(sql, raterCleanerId, rateeCleanerId, bookingId);
  return { prompt: !rated && !sharedBefore, alreadyRated: rated, sharedBefore };
}

export type Thumbs = "up" | "down";

export interface SubmitPeerRatingInput {
  bookingId: string;
  raterCleanerId: string;
  rateeCleanerId: string;
  thumbs: Thumbs;
  comment?: string | null;
}

export type SubmitPeerRatingResult =
  | { ok: true; id: string }
  | { ok: false; code: "SELF" | "NOT_SHARED" | "NOT_FIRST" | "ALREADY_RATED" };

/**
 * Record a peer rating. Enforces: rater ≠ ratee, both present on this booking,
 * this is their first shared booking, and one rating per ordered pair ever. The
 * UNIQUE(rater, ratee) constraint is the authoritative once-ever lock (a race
 * that slips past the pre-check still fails to ALREADY_RATED via ON CONFLICT).
 */
export async function submitPeerRating(
  sql: Sql,
  input: SubmitPeerRatingInput,
): Promise<SubmitPeerRatingResult> {
  const { bookingId, raterCleanerId, rateeCleanerId, thumbs } = input;
  if (raterCleanerId === rateeCleanerId) return { ok: false, code: "SELF" };

  if (!(await sharedThisBooking(sql, bookingId, raterCleanerId, rateeCleanerId))) {
    return { ok: false, code: "NOT_SHARED" };
  }
  if (await alreadyRated(sql, raterCleanerId, rateeCleanerId)) {
    return { ok: false, code: "ALREADY_RATED" };
  }
  if (await sharedAnotherBooking(sql, raterCleanerId, rateeCleanerId, bookingId)) {
    // A prior shared booking means this is not their first pairing.
    return { ok: false, code: "NOT_FIRST" };
  }

  const comment = input.comment ? input.comment.slice(0, 2000) : null;
  const rows = (await sql`
    INSERT INTO crew_peer_ratings (booking_id, rater_cleaner_id, ratee_cleaner_id, thumbs, comment)
    VALUES (${bookingId}, ${raterCleanerId}, ${rateeCleanerId}, ${thumbs}, ${comment})
    ON CONFLICT (rater_cleaner_id, ratee_cleaner_id) DO NOTHING
    RETURNING id
  `) as Array<{ id: string }>;
  if (!rows[0]) return { ok: false, code: "ALREADY_RATED" };
  return { ok: true, id: rows[0].id };
}
