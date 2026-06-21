import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";

export const adminRouter = new Hono<AppBindings>();

const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

adminRouter.use("*", requireAuth, requireAdmin);

adminRouter.get("/stats", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT
      (SELECT COUNT(*) FROM bookings) AS total_bookings,
      (SELECT COUNT(*) FROM cleaners WHERE status = 'pending') AS pending_cleaners,
      (SELECT COUNT(*) FROM disputes WHERE status = 'open') AS open_disputes
  `) as Array<Record<string, unknown>>;
  return c.json({ stats: rows[0] });
});

adminRouter.get("/cleaners/pending", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cleaners = (await sql`
    SELECT * FROM cleaners WHERE status = 'pending' ORDER BY created_at DESC
  `) as unknown[];
  return c.json({ cleaners });
});
