import { Hono } from "hono";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";
import type { NotificationRow } from "@sweepr/db";

export const notificationsRouter = new Hono<AppBindings>();

notificationsRouter.use("*", requireAuth);

/** List notifications for the current user, unread first. */
notificationsRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ notifications: [] });

  const rows = (await sql`
    SELECT * FROM notifications
    WHERE user_id = ${user.id}
    ORDER BY read ASC, created_at DESC
    LIMIT 50
  `) as NotificationRow[];

  const notifications = rows.map((r) => ({
    id: r.id,
    title: r.title ?? "",
    body: r.body ?? undefined,
    createdAt: r.created_at,
    read: r.read,
    href: (r.data as { href?: string } | null)?.href,
  }));

  return c.json({ notifications });
});

/** Mark a single notification as read. */
notificationsRouter.patch("/:id/read", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);
  const id = c.req.param("id");
  await sql`
    UPDATE notifications SET read = true
    WHERE id = ${id} AND user_id = ${user.id}
  `;
  return c.json({ ok: true });
});

/** Mark all notifications as read. */
notificationsRouter.patch("/read-all", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);
  await sql`
    UPDATE notifications SET read = true WHERE user_id = ${user.id}
  `;
  return c.json({ ok: true });
});
