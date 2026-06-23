import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
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

  // Short cache — mobile clients can reuse this for 30 s
  c.header("Cache-Control", "private, max-age=30");
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

// ---------------------------------------------------------------------------
// Mobile push notification device token registration
// ---------------------------------------------------------------------------

const deviceTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["fcm", "apns"]).default("fcm"),
});

/**
 * Register or refresh an FCM/APNs device token for the current user.
 * Call this on app launch and whenever the OS issues a new token.
 * Safe to call repeatedly — uses upsert semantics.
 */
notificationsRouter.put(
  "/device-token",
  zValidator("json", deviceTokenSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const user = await getUserByClerkId(sql, c.get("user").clerkId);
    if (!user) return c.json({ error: "User not found" }, 404);

    const { token, platform } = c.req.valid("json");

    await sql`
      INSERT INTO device_tokens (user_id, token, platform, updated_at)
      VALUES (${user.id}, ${token}, ${platform}, NOW())
      ON CONFLICT (user_id, token)
      DO UPDATE SET platform = EXCLUDED.platform, updated_at = NOW()
    `;

    return c.json({ ok: true });
  }
);

/** Remove a device token (e.g. on sign-out). */
notificationsRouter.delete("/device-token", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ ok: true });

  const token = c.req.query("token");
  if (!token) {
    // Remove all tokens for this user (full sign-out)
    await sql`DELETE FROM device_tokens WHERE user_id = ${user.id}`;
  } else {
    await sql`DELETE FROM device_tokens WHERE user_id = ${user.id} AND token = ${token}`;
  }
  return c.json({ ok: true });
});
