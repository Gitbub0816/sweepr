import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getBooking,
  getCustomerByUserId,
  getUserByClerkId,
  listBookingsForCustomer,
  updateBookingStatus,
} from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { rankCleanersForBooking } from "../lib/matching";
import { sendNotification } from "../lib/notifications";
import type { AppBindings } from "../types";
import type { BookingRow, CleanerRow } from "@sweepr/db";

export const bookingsRouter = new Hono<AppBindings>();

const createSchema = z.object({
  serviceType: z.string(),
  bedrooms: z.number().int(),
  bathrooms: z.number().int(),
  sqft: z.number().int(),
  homeType: z.string(),
  addOnKeys: z.array(z.string()).default([]),
  scheduledAt: z.string(),
  addressId: z.string().optional(),
  basePrice: z.number().int(),
  addonsTotal: z.number().int().default(0),
  serviceFee: z.number().int().default(0),
  tax: z.number().int().default(0),
  totalPrice: z.number().int(),
  notes: z.string().optional(),
});

bookingsRouter.use("*", requireAuth);

bookingsRouter.post("/", zValidator("json", createSchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);
  const customer = await getCustomerByUserId(sql, user.id);
  if (!customer) return c.json({ error: "Customer not found" }, 404);

  const rows = (await sql`
    INSERT INTO bookings (
      customer_id, address_id, status, service_type, bedrooms, bathrooms,
      sqft, home_type, scheduled_at, base_price, addons_total, service_fee,
      tax, total_price, notes
    ) VALUES (
      ${customer.id}, ${input.addressId ?? null}, 'booked', ${input.serviceType},
      ${input.bedrooms}, ${input.bathrooms}, ${input.sqft}, ${input.homeType},
      ${input.scheduledAt}, ${input.basePrice}, ${input.addonsTotal},
      ${input.serviceFee}, ${input.tax}, ${input.totalPrice}, ${input.notes ?? null}
    ) RETURNING *
  `) as BookingRow[];

  // Booking confirmed -> notify customer.
  await sendNotification(sql, user.id, {
    type: "booking_confirmed",
    title: "Booking confirmed",
    body: `Your ${input.serviceType} clean is booked. We're finding you a cleaner.`,
    data: { href: `/bookings/${rows[0].id}` },
  });

  return c.json({ booking: rows[0] }, 201);
});

bookingsRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ bookings: [] });
  const customer = await getCustomerByUserId(sql, user.id);
  if (!customer) return c.json({ bookings: [] });
  const bookings = await listBookingsForCustomer(sql, customer.id);
  return c.json({ bookings });
});

bookingsRouter.get("/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const booking = await getBooking(sql, c.req.param("id"));
  if (!booking) return c.json({ error: "Not found" }, 404);
  return c.json({ booking });
});

const statusSchema = z.object({ status: z.string() });

bookingsRouter.patch(
  "/:id/status",
  zValidator("json", statusSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const updated = await updateBookingStatus(
      sql,
      c.req.param("id"),
      c.req.valid("json").status
    );
    if (!updated) return c.json({ error: "Not found" }, 404);
    return c.json({ booking: updated });
  }
);

/** Helper: notify the customer that owns a booking. */
async function notifyBookingCustomer(
  sql: ReturnType<typeof getDb>,
  booking: BookingRow,
  payload: Parameters<typeof sendNotification>[2]
) {
  if (!booking.customer_id) return;
  const rows = (await sql`
    SELECT u.id FROM customers c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = ${booking.customer_id}
  `) as { id: string }[];
  if (rows[0]) await sendNotification(sql, rows[0].id, payload);
}

/** Helper: notify a cleaner by cleaner id. */
async function notifyCleaner(
  sql: ReturnType<typeof getDb>,
  cleanerId: string,
  payload: Parameters<typeof sendNotification>[2]
) {
  const rows = (await sql`
    SELECT user_id FROM cleaners WHERE id = ${cleanerId}
  `) as { user_id: string }[];
  if (rows[0]) await sendNotification(sql, rows[0].user_id, payload);
}

/**
 * Run the matching engine, create offers for the top 3 cleaners, and notify
 * the top-ranked cleaner. Admin or system triggered.
 */
bookingsRouter.post("/:id/match", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const booking = (await getBooking(sql, c.req.param("id"))) as BookingRow | null;
  if (!booking) return c.json({ error: "Not found" }, 404);

  const cleaners = (await sql`
    SELECT * FROM cleaners WHERE status = 'active'
  `) as CleanerRow[];

  const ranked = await rankCleanersForBooking(booking, cleaners, sql);
  const top = ranked.slice(0, 3);
  if (top.length === 0) {
    return c.json({ error: "No eligible cleaners" }, 409);
  }

  const offers: { id: string; cleanerId: string; rank: number }[] = [];
  for (let i = 0; i < top.length; i++) {
    const rows = (await sql`
      INSERT INTO job_offers (booking_id, cleaner_id, rank, score, status)
      VALUES (${booking.id}, ${top[i].cleanerId}, ${i}, ${top[i].score}, ${
        i === 0 ? "offered" : "queued"
      })
      RETURNING id
    `) as { id: string }[];
    offers.push({ id: rows[0].id, cleanerId: top[i].cleanerId, rank: i });
  }

  await updateBookingStatus(sql, booking.id, "matching");

  // Notify the top cleaner (in-app + email best-effort).
  await notifyCleaner(sql, top[0].cleanerId, {
    type: "job_offered",
    title: "New job offer",
    body: `A ${booking.service_type} clean is available near you.`,
    data: { href: `/jobs`, bookingId: booking.id },
  });

  return c.json({ offers, ranked: top });
});

const respondSchema = z.object({
  response: z.enum(["accepted", "declined"]),
});

/** Cleaner responds to a job offer. */
bookingsRouter.post(
  "/:id/offers/:offerId/respond",
  zValidator("json", respondSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const bookingId = c.req.param("id");
    const offerId = c.req.param("offerId");
    const { response } = c.req.valid("json");

    const booking = (await getBooking(sql, bookingId)) as BookingRow | null;
    if (!booking) return c.json({ error: "Booking not found" }, 404);

    const offerRows = (await sql`
      SELECT * FROM job_offers WHERE id = ${offerId} AND booking_id = ${bookingId}
    `) as { id: string; cleaner_id: string; rank: number }[];
    const offer = offerRows[0];
    if (!offer) return c.json({ error: "Offer not found" }, 404);

    if (response === "accepted") {
      await sql`UPDATE job_offers SET status = 'accepted' WHERE id = ${offerId}`;
      await sql`
        UPDATE bookings SET cleaner_id = ${offer.cleaner_id},
          status = 'cleaner_accepted', updated_at = now()
        WHERE id = ${bookingId}
      `;
      await notifyBookingCustomer(sql, booking, {
        type: "cleaner_assigned",
        title: "Your cleaner is confirmed",
        body: "A cleaner has accepted your booking.",
        data: { href: `/bookings/${bookingId}` },
      });
      return c.json({ ok: true, status: "cleaner_accepted" });
    }

    // Declined -> offer the next queued cleaner.
    await sql`UPDATE job_offers SET status = 'declined' WHERE id = ${offerId}`;
    const next = (await sql`
      SELECT * FROM job_offers
      WHERE booking_id = ${bookingId} AND status = 'queued'
      ORDER BY rank ASC LIMIT 1
    `) as { id: string; cleaner_id: string }[];

    if (next[0]) {
      await sql`UPDATE job_offers SET status = 'offered' WHERE id = ${next[0].id}`;
      await notifyCleaner(sql, next[0].cleaner_id, {
        type: "job_offered",
        title: "New job offer",
        body: `A ${booking.service_type} clean is available near you.`,
        data: { href: `/jobs`, bookingId },
      });
      return c.json({ ok: true, status: "offered_next" });
    }

    // All declined -> back to matching, alert admins to re-run wider search.
    await updateBookingStatus(sql, bookingId, "matching");
    const admins = (await sql`
      SELECT id FROM users WHERE role = 'admin'
    `) as { id: string }[];
    for (const a of admins) {
      await sendNotification(sql, a.id, {
        type: "match_exhausted",
        title: "Booking needs manual matching",
        body: `All offered cleaners declined booking ${bookingId}.`,
        data: { href: `/jobs/${bookingId}` },
      });
    }
    return c.json({ ok: true, status: "match_exhausted" });
  }
);
