import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getBooking,
  getCustomerByUserId,
  getUserByClerkId,
  upsertUser,
  listBookingsForCustomer,
  updateBookingStatus,
} from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { rankCleanersForBooking } from "../lib/matching";
import { initiateAssignment } from "../lib/assignment";
import { sendNotification } from "../lib/notifications";
import { rateLimit } from "../middleware/rateLimit";
import { assertValidTransition } from "../lib/statusMachine";
import { audit } from "../lib/audit";
import { serverTrack } from "../lib/posthog";
import { logger } from "../lib/logger";
import { assertBookingAccess } from "../lib/bookingAccess";
import { calculateBookingPrice, getAddOnCatalogue } from "../lib/pricingEngine";
import { resolveBookingPricing, storeQuoteSnapshot } from "../lib/resolvePricing";
import type { AppBindings } from "../types";
import type { BookingRow, CleanerRow } from "@sweepr/db";

export const bookingsRouter = new Hono<AppBindings>();

const createSchema = z.object({
  serviceType: z.enum(["standard", "deep", "move_in_out", "recurring"]),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().int().min(0).max(20),
  sqft: z.number().int().min(100).max(20000),
  homeType: z.enum(["apartment", "house", "condo", "townhouse", "other"]),
  hasPets: z.boolean().default(false),
  heavyMess: z.boolean().default(false),
  suppliesNeeded: z.boolean().default(false),
  parkingNotes: z.string().max(500).optional(),
  entryNotes: z.string().max(500).optional(),
  addOnKeys: z.array(z.string().max(50)).max(20).default([]),
  scheduledAt: z.string().datetime(),
  addressId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
  // Client must NOT submit prices — server always calculates.
});

// Customers may only cancel via the status endpoint.
const statusSchema = z.object({
  status: z.enum(["cancelled_by_customer"]),
});

bookingsRouter.use("*", requireAuth);

bookingsRouter.post(
  "/",
  rateLimit({ limit: 10, windowMs: 60 * 60_000, keyPrefix: "booking-create" }),
  zValidator("json", createSchema),
  async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");
  const user = (await getUserByClerkId(sql, authUser.clerkId)) ??
    await upsertUser(sql, { clerkId: authUser.clerkId, email: authUser.email || `${authUser.clerkId}@noemail.sweepr.local`, role: "customer" });
  await sql`INSERT INTO customers (user_id) SELECT ${user.id} WHERE NOT EXISTS (SELECT 1 FROM customers WHERE user_id = ${user.id})`;
  const customer = await getCustomerByUserId(sql, user.id);
  if (!customer) return c.json({ error: "Customer not found" }, 404);

  // Server-side price calculation — client values are never trusted.
  // Prefer the active algorithmic pricing rule; fall back to the legacy
  // calculator when no rule is active for this market.
  const price = calculateBookingPrice(input);
  let resolved = null;
  try {
    resolved = await resolveBookingPricing(sql, input);
  } catch (err) {
    logger.error("resolveBookingPricing failed", err, {});
  }
  const totalPrice = resolved ? resolved.breakdown.customer_total_cents : price.totalPrice;
  const basePrice = resolved ? resolved.breakdown.base_fee_cents : price.basePrice;
  const addonsTotal = resolved ? resolved.breakdown.add_ons_total_cents : price.addonsTotal;
  const cleanerPayout = resolved ? resolved.breakdown.estimated_cleaner_payout_cents : null;

  const rows = (await sql`
    INSERT INTO bookings (
      customer_id, address_id, status, service_type, bedrooms, bathrooms,
      sqft, home_type, scheduled_at, base_price, addons_total, service_fee,
      tax, total_price, notes,
      pricing_rule_id, pricing_rule_version, pricing_line_items_json, estimated_cleaner_payout_cents
    ) VALUES (
      ${customer.id}, ${input.addressId ?? null}, 'booked', ${input.serviceType},
      ${input.bedrooms}, ${input.bathrooms}, ${input.sqft}, ${input.homeType},
      ${input.scheduledAt}, ${basePrice}, ${addonsTotal},
      ${resolved ? 0 : price.serviceFee}, ${resolved ? 0 : price.tax}, ${totalPrice}, ${input.notes ?? null},
      ${resolved ? resolved.ruleId : null}, ${resolved ? resolved.ruleVersion : null},
      ${resolved ? JSON.stringify(resolved.breakdown.line_items) : null}, ${cleanerPayout}
    ) RETURNING *
  `) as BookingRow[];

  const created = rows[0];
  if (!created) return c.json({ error: "Failed to create booking" }, 500);

  // Persist the immutable quote snapshot and stamp it on the booking.
  if (resolved) {
    try {
      const quoteId = await storeQuoteSnapshot(sql, resolved, { customerId: customer.id, bookingId: created.id });
      await sql`UPDATE bookings SET pricing_quote_id = ${quoteId} WHERE id = ${created.id}`;
    } catch (err) {
      logger.error("storeQuoteSnapshot failed", err, { bookingId: created.id });
    }
  }

  // Booking confirmed -> notify customer.
  await sendNotification(sql, user.id, {
    type: "booking_confirmed",
    title: "Booking confirmed",
    body: `Your ${input.serviceType} clean is booked. We're finding you a cleaner.`,
    data: { href: `/bookings/${created.id}` },
  });

  await audit(sql, {
    action: "booking.created",
    actorClerkId: c.get("user").clerkId,
    targetType: "booking",
    targetId: created.id,
    metadata: { serviceType: input.serviceType, totalPrice: price.totalPrice },
    ipAddress: c.req.header("CF-Connecting-IP"),
    userAgent: c.req.header("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  await serverTrack(c.env, "booking_confirmed", c.get("user").clerkId, {
    bookingId: created.id,
    serviceType: input.serviceType,
    totalPrice: price.totalPrice,
  });

  // Silent auto-assignment: rank cleaners and offer to the best match.
  try {
    await initiateAssignment(sql, created.id);
  } catch (err) {
    logger.error("initiateAssignment failed", err, { bookingId: created.id });
  }

  return c.json({ booking: created }, 201);
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

/** Quote endpoint — returns server-calculated price without creating a booking. */
bookingsRouter.post("/quote", zValidator("json", createSchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const catalogue = getAddOnCatalogue();
  try {
    const resolved = await resolveBookingPricing(sql, input);
    if (resolved) {
      // Algorithmic pricing active: expose only the customer total + line items.
      return c.json({
        price: {
          totalPrice: resolved.breakdown.customer_total_cents,
          lineItems: resolved.breakdown.line_items,
          requiresCustomQuote: resolved.breakdown.requires_custom_quote,
        },
        catalogue,
        engine: "rule",
      });
    }
  } catch {
    /* fall through to legacy */
  }
  return c.json({ price: calculateBookingPrice(input), catalogue, engine: "legacy" });
});

bookingsRouter.get("/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const bookingId = c.req.param("id");
  const access = await assertBookingAccess(sql, bookingId, c.get("user").clerkId);
  if (!access.allowed) return c.json({ error: "Forbidden" }, 403);
  const booking = await getBooking(sql, bookingId);
  if (!booking) return c.json({ error: "Not found" }, 404);
  return c.json({ booking });
});

bookingsRouter.patch(
  "/:id/status",
  zValidator("json", statusSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const { status } = c.req.valid("json");

    const access = await assertBookingAccess(sql, id, c.get("user").clerkId);
    if (!access.allowed) return c.json({ error: "Forbidden" }, 403);

    const booking = await getBooking(sql, id);
    if (!booking) return c.json({ error: "Not found" }, 404);

    if (!isValidTransitionSafe(booking.status, status)) {
      return c.json(
        { error: `Invalid status transition: ${booking.status} → ${status}` },
        409
      );
    }

    const updated = await updateBookingStatus(sql, id, status);
    if (!updated) return c.json({ error: "Not found" }, 404);

    await audit(sql, {
      action: "booking.status_changed",
      actorClerkId: c.get("user").clerkId,
      targetType: "booking",
      targetId: id,
      metadata: { from: booking.status, to: status },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({ booking: updated });
  }
);

function isValidTransitionSafe(from: string, to: string): boolean {
  try {
    assertValidTransition(from, to);
    return true;
  } catch {
    return false;
  }
}

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
    const candidate = top[i];
    if (!candidate) continue;
    const rows = (await sql`
      INSERT INTO job_offers (booking_id, cleaner_id, rank, score, status)
      VALUES (${booking.id}, ${candidate.cleanerId}, ${i}, ${candidate.score}, ${
        i === 0 ? "offered" : "queued"
      })
      RETURNING id
    `) as { id: string }[];
    const offerRow = rows[0];
    if (offerRow) {
      offers.push({ id: offerRow.id, cleanerId: candidate.cleanerId, rank: i });
    }
  }

  await updateBookingStatus(sql, booking.id, "matching");

  const topCleaner = top[0];
  if (!topCleaner) return c.json({ error: "No eligible cleaners" }, 409);

  // Notify the top cleaner (in-app + email best-effort).
  await notifyCleaner(sql, topCleaner.cleanerId, {
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

    const nextOffer = next[0];
    if (nextOffer) {
      await sql`UPDATE job_offers SET status = 'offered' WHERE id = ${nextOffer.id}`;
      await notifyCleaner(sql, nextOffer.cleaner_id, {
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
