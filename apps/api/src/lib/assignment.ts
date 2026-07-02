import type { Sql, BookingRow, CleanerRow } from "@sweepr/db";
import {
  rankCleanersForBooking,
  eligibleCleanersForBooking,
} from "./matching";
import { logger } from "./logger";
import { AppError } from "./errors";
import { checkInsurance } from "./cleanerRequirements";
import { OFFER_EXPIRY_MINUTES } from "./constants";
import { sendNotification } from "./notifications";

const MAX_CANDIDATES = 5;

/** Notify a cleaner (by cleaner id) about a job offer. */
async function notifyCleaner(
  db: Sql,
  cleanerId: string,
  booking: BookingRow
): Promise<void> {
  const rows = (await db`
    SELECT user_id FROM cleaners WHERE id = ${cleanerId}
  `) as { user_id: string }[];
  if (rows[0]) {
    await sendNotification(db, rows[0].user_id, {
      type: "job_offered",
      title: "New job offer",
      body: `A ${booking.service_type} clean is available near you. Respond within ${OFFER_EXPIRY_MINUTES} minutes.`,
      data: { href: "/jobs", bookingId: booking.id },
    });
  }
}

/** Notify the booking's customer. */
async function notifyCustomer(
  db: Sql,
  booking: BookingRow,
  title: string,
  body: string
): Promise<void> {
  if (!booking.customer_id) return;
  const rows = (await db`
    SELECT u.id FROM customers c JOIN users u ON u.id = c.user_id
    WHERE c.id = ${booking.customer_id}
  `) as { id: string }[];
  if (rows[0]) {
    await sendNotification(db, rows[0].id, {
      type: "cleaner_assigned",
      title,
      body,
      data: { href: `/bookings/${booking.id}` },
    });
  }
}

/** Offer a queued candidate at the given position. Returns true if offered. */
async function offerPosition(
  db: Sql,
  booking: BookingRow,
  position: number
): Promise<boolean> {
  const rows = (await db`
    SELECT * FROM assignment_queue
    WHERE booking_id = ${booking.id} AND position = ${position}
      AND status = 'pending'
    LIMIT 1
  `) as { id: string; cleaner_id: string }[];
  const candidate = rows[0];
  if (!candidate) return false;

  const expiresAt = new Date(
    Date.now() + OFFER_EXPIRY_MINUTES * 60 * 1000
  ).toISOString();
  await db`
    UPDATE assignment_queue SET offered_at = NOW(), expires_at = ${expiresAt}
    WHERE id = ${candidate.id}
  `;
  await db`
    UPDATE bookings SET status = 'offered_to_cleaner', updated_at = NOW()
    WHERE id = ${booking.id}
  `;
  await notifyCleaner(db, candidate.cleaner_id, booking);
  return true;
}

/**
 * Silent auto-assignment: rank eligible cleaners, build the offer queue, and
 * offer position 1.
 */
export async function initiateAssignment(
  sql: Sql,
  bookingId: string
): Promise<void> {
  const bookingRows = (await sql`
    SELECT * FROM bookings WHERE id = ${bookingId} LIMIT 1
  `) as BookingRow[];
  const booking = bookingRows[0];
  if (!booking) {
    logger.warn("initiateAssignment: booking not found", { bookingId });
    return;
  }

  const cleaners = (await sql`
    SELECT * FROM cleaners WHERE status IN ('approved', 'active')
  `) as CleanerRow[];

  const eligible = await eligibleCleanersForBooking(booking, cleaners, sql);
  const ranked = await rankCleanersForBooking(booking, eligible, sql);
  const top = ranked.slice(0, MAX_CANDIDATES);

  if (top.length === 0) {
    await sql`
      UPDATE bookings SET status = 'matching', updated_at = NOW()
      WHERE id = ${bookingId}
    `;
    const admins = (await sql`SELECT id FROM users WHERE role = 'admin'`) as {
      id: string;
    }[];
    for (const a of admins) {
      await sendNotification(sql, a.id, {
        type: "match_needed",
        title: "Booking needs manual matching",
        body: `No eligible cleaners found for booking ${bookingId}.`,
        data: { href: `/jobs/${bookingId}` },
      });
    }
    return;
  }

  await sql`UPDATE bookings SET status = 'matching', updated_at = NOW() WHERE id = ${bookingId}`;

  const expiresAt = new Date(
    Date.now() + OFFER_EXPIRY_MINUTES * 60 * 1000
  ).toISOString();
  for (let i = 0; i < top.length; i++) {
    const candidate = top[i];
    if (!candidate) continue;
    await sql`
      INSERT INTO assignment_queue
        (booking_id, cleaner_id, position, status, expires_at, score, score_breakdown)
      VALUES (
        ${bookingId}, ${candidate.cleanerId}, ${i + 1}, 'pending', ${expiresAt},
        ${candidate.score}, ${JSON.stringify(candidate.breakdown)}::jsonb
      )
    `;
  }

  await offerPosition(sql, booking, 1);

  logger.info("assignment.initiated", {
    bookingId,
    candidates: top.length,
  });
}

/** Handle a cleaner accepting or declining an offer. */
export async function handleOfferResponse(
  sql: Sql,
  bookingId: string,
  cleanerId: string,
  response: "accepted" | "declined"
): Promise<void> {
  const bookingRows = (await sql`
    SELECT * FROM bookings WHERE id = ${bookingId} LIMIT 1
  `) as BookingRow[];
  const booking = bookingRows[0];
  if (!booking) return;

  if (response === "accepted") {
    // Server-side eligibility: valid insurance is required to take jobs.
    // (The dashboard checklist mirrors this — this is the enforcement point.)
    const insurance = await checkInsurance(sql, cleanerId);
    if (!insurance.valid) {
      throw new AppError(
        "insurance_required",
        "Valid insurance is required before accepting jobs.",
        403,
      );
    }
    const updated = await sql`
      UPDATE assignment_queue SET status = 'accepted'
      WHERE booking_id = ${bookingId} AND cleaner_id = ${cleanerId}
        AND status NOT IN ('accepted', 'declined', 'expired')
      RETURNING id
    `;
    if (!updated[0]) {
      throw new AppError("offer_already_resolved", "This offer has already been accepted, declined, or expired.", 409);
    }
    await sql`
      UPDATE bookings SET cleaner_id = ${cleanerId},
        status = 'cleaner_accepted', updated_at = NOW()
      WHERE id = ${bookingId} AND status NOT IN ('cleaner_accepted', 'confirmed', 'in_progress', 'completed')
    `;
    await notifyCustomer(
      sql,
      booking,
      "Your cleaner has been assigned!",
      "A cleaner has accepted your booking."
    );
    logger.info("assignment.accepted", { bookingId, cleanerId });
    return;
  }

  // Declined: mark current offer, cascade to next position.
  const declinedRows = (await sql`
    UPDATE assignment_queue SET status = 'declined'
    WHERE booking_id = ${bookingId} AND cleaner_id = ${cleanerId}
      AND status = 'pending'
    RETURNING position
  `) as { position: number }[];
  const declinedPos = declinedRows[0]?.position ?? 0;

  await cascadeFrom(sql, booking, declinedPos);
}

/** Offer the next pending position after `fromPosition`, or escalate to admin. */
async function cascadeFrom(
  db: Sql,
  booking: BookingRow,
  fromPosition: number
): Promise<void> {
  const nextRows = (await db`
    SELECT position FROM assignment_queue
    WHERE booking_id = ${booking.id} AND status = 'pending'
      AND position > ${fromPosition}
    ORDER BY position ASC LIMIT 1
  `) as { position: number }[];

  if (nextRows[0]) {
    await offerPosition(db, booking, nextRows[0].position);
    return;
  }

  // No more candidates — back to matching, alert admins.
  await db`
    UPDATE bookings SET status = 'matching', updated_at = NOW()
    WHERE id = ${booking.id}
  `;
  const admins = (await db`SELECT id FROM users WHERE role = 'admin'`) as {
    id: string;
  }[];
  for (const a of admins) {
    await sendNotification(db, a.id, {
      type: "match_exhausted",
      title: "Booking needs manual matching",
      body: `All offered cleaners declined or expired for booking ${booking.id}.`,
      data: { href: `/jobs/${booking.id}` },
    });
  }
}

/**
 * Cron-compatible: expire offers that have timed out and cascade to the next
 * candidate.
 */
export async function processExpiredOffers(db: Sql): Promise<void> {
  const expired = (await db`
    UPDATE assignment_queue SET status = 'expired'
    WHERE status = 'pending' AND expires_at < NOW()
    RETURNING booking_id, position
  `) as { booking_id: string; position: number }[];

  for (const row of expired) {
    const bookingRows = (await db`
      SELECT * FROM bookings WHERE id = ${row.booking_id} LIMIT 1
    `) as BookingRow[];
    const booking = bookingRows[0];
    if (!booking) continue;
    // Only cascade if the booking is still awaiting a cleaner.
    if (
      booking.status === "offered_to_cleaner" ||
      booking.status === "matching"
    ) {
      await cascadeFrom(db, booking, row.position);
    }
  }
}
