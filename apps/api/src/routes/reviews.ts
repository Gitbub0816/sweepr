import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
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
    const rows = (await sql`
      INSERT INTO reviews (booking_id, cleaner_id, rating, comment)
      VALUES (${input.bookingId}, ${input.cleanerId}, ${input.rating}, ${input.comment ?? null})
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
