import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getCleanerByUserId, getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";

export const cleanersRouter = new Hono<AppBindings>();

cleanersRouter.use("*", requireAuth);

cleanersRouter.get("/me", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);
  const cleaner = await getCleanerByUserId(sql, user.id);
  return c.json({ cleaner });
});

const profileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

cleanersRouter.patch("/me", zValidator("json", profileSchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);

  const rows = (await sql`
    UPDATE cleaners SET
      first_name = COALESCE(${input.firstName ?? null}, first_name),
      last_name  = COALESCE(${input.lastName ?? null}, last_name),
      phone      = COALESCE(${input.phone ?? null}, phone),
      bio        = COALESCE(${input.bio ?? null}, bio),
      avatar_url = COALESCE(${input.avatarUrl ?? null}, avatar_url)
    WHERE user_id = ${user.id}
    RETURNING *
  `) as unknown[];

  return c.json({ cleaner: rows[0] ?? null });
});
