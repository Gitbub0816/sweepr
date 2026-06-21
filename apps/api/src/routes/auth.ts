import { Hono } from "hono";
import { upsertUser } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";

export const authRouter = new Hono<AppBindings>();

/** Sync the signed-in Clerk user into our DB (idempotent). */
authRouter.post("/sync", requireAuth, async (c) => {
  const { clerkId, email } = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);
  const user = await upsertUser(sql, {
    clerkId,
    email: email ?? `${clerkId}@unknown.sweepr`,
  });
  return c.json({ user });
});

authRouter.get("/me", requireAuth, (c) => c.json({ user: c.get("user") }));
