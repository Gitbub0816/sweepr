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
