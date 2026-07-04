import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { getUserByClerkId, getCustomerByUserId } from "@sweepr/db";
import { sanitizeText } from "../lib/sanitizeText";
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
      SELECT id, customer_id, cleaner_id, status, completed_at FROM bookings WHERE id = ${input.bookingId} LIMIT 1
    `) as Array<{ id: string; customer_id: string; cleaner_id: string | null; status: string; completed_at: string | null }>;
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
    if (booking.cleaner_id !== input.cleanerId) {
      return c.json({ error: "cleanerId does not match this booking" }, 400);
    }

    const comment = input.comment ? sanitizeText(input.comment, 2000) : null;
    const rows = (await sql`
      INSERT INTO reviews (booking_id, customer_id, cleaner_id, rating, comment)
      VALUES (${input.bookingId}, ${customer.id}, ${input.cleanerId}, ${input.rating}, ${comment})
      ON CONFLICT (booking_id) DO UPDATE
        SET rating = EXCLUDED.rating, comment = EXCLUDED.comment
      RETURNING *
    `) as unknown[];
    return c.json({ review: rows[0] }, 201);
  }
);

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
