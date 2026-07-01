import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { getUserByClerkId, getCustomerByUserId } from "@sweepr/db";
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
      SELECT id, customer_id, cleaner_id, status FROM bookings WHERE id = ${input.bookingId} LIMIT 1
    `) as Array<{ id: string; customer_id: string; cleaner_id: string | null; status: string }>;
    const booking = bookingRows[0];
    if (!booking) return c.json({ error: "Booking not found" }, 404);
    if (booking.customer_id !== customer.id) return c.json({ error: "Forbidden" }, 403);
    if (booking.status !== "completed") {
      return c.json({ error: "Booking must be completed before it can be reviewed" }, 409);
    }
    if (booking.cleaner_id !== input.cleanerId) {
      return c.json({ error: "cleanerId does not match this booking" }, 400);
    }

    const rows = (await sql`
      INSERT INTO reviews (booking_id, customer_id, cleaner_id, rating, comment)
      VALUES (${input.bookingId}, ${customer.id}, ${input.cleanerId}, ${input.rating}, ${input.comment ?? null})
      ON CONFLICT (booking_id) DO UPDATE
        SET rating = EXCLUDED.rating, comment = EXCLUDED.comment
      RETURNING *
    `) as unknown[];
    return c.json({ review: rows[0] }, 201);
  }
);

reviewsRouter.get("/cleaner/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const reviews = (await sql`
    SELECT * FROM reviews WHERE cleaner_id = ${c.req.param("id")}
    ORDER BY created_at DESC
  `) as unknown[];
  return c.json({ reviews });
});
