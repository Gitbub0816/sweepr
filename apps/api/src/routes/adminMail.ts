/**
 * Admin Mail Center — embedded email client for the built-in mailboxes.
 *
 *   GET    /admin/mail/boxes                     mailboxes visible to this admin
 *   GET    /admin/mail/:box/messages             inbound+outbound, newest first
 *   POST   /admin/mail/:box/messages/:id/read    toggle read
 *   POST   /admin/mail/:box/send                 send/reply from box@getsweepr.com
 *
 *   Permission management (super_admin only; super admins implicitly see all):
 *   GET    /admin/mail/permissions
 *   POST   /admin/mail/permissions               { userId, mailbox }
 *   DELETE /admin/mail/permissions/:id
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin, requireAdminRole } from "../middleware/adminRoles";
import { isOwnerClerkId } from "../lib/owner";
import { sendEmail, wrapBodyInTemplate } from "../lib/mailer";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";

export const adminMailRouter = new Hono<AppBindings>();
adminMailRouter.use("*", requireAuth, requireAdmin);

export const MAILBOXES = ["caleb", "kristin", "news", "updates", "help", "alerts"] as const;
type Mailbox = (typeof MAILBOXES)[number];

const BOX_NAMES: Record<Mailbox, string> = {
  caleb: "Caleb",
  kristin: "Kristin",
  news: "Sweepr News",
  updates: "Sweepr Updates",
  help: "Sweepr Help",
  alerts: "Sweepr Alerts",
};

type DbUser = { id: string; role: string | null; admin_role?: string | null };

function isSuper(user: DbUser, clerkId: string, env: AppBindings["Bindings"]): boolean {
  return (
    isOwnerClerkId(clerkId, env) ||
    user.role === "super_admin" ||
    (user as Record<string, unknown>).admin_role === "super_admin"
  );
}

/** Mailboxes the user may access: super admins get all, others what they're granted. */
async function accessibleBoxes(
  sql: ReturnType<typeof getDb>,
  user: DbUser,
  clerkId: string,
  env: AppBindings["Bindings"],
): Promise<Mailbox[]> {
  if (isSuper(user, clerkId, env)) return [...MAILBOXES];
  const rows = (await sql`
    SELECT mailbox FROM mailbox_permissions WHERE user_id = ${user.id}
  `) as Array<{ mailbox: string }>;
  return rows.map((r) => r.mailbox).filter((m): m is Mailbox => (MAILBOXES as readonly string[]).includes(m));
}

// ─── Mailboxes ────────────────────────────────────────────────────────────────

adminMailRouter.get("/boxes", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;
  const user = (await getUserByClerkId(sql, clerkId)) as DbUser | null;
  if (!user) return c.json({ error: "User not found" }, 404);

  const boxes = await accessibleBoxes(sql, user, clerkId, c.env);
  if (boxes.length === 0) return c.json({ boxes: [] });

  const counts = (await sql`
    SELECT mailbox,
           COUNT(*) FILTER (WHERE direction = 'inbound' AND read_at IS NULL AND archived_at IS NULL)::int AS unread,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE direction = 'inbound' AND archived_at IS NULL)::int AS inbox_count,
           COUNT(*) FILTER (WHERE direction = 'outbound')::int AS sent_count
    FROM mailbox_messages
    WHERE mailbox = ANY(${boxes})
    GROUP BY mailbox
  `) as Array<{ mailbox: string; unread: number; total: number; inbox_count: number; sent_count: number }>;
  const byBox = new Map(counts.map((r) => [r.mailbox, r]));

  return c.json({
    boxes: boxes.map((b) => ({
      id: b,
      address: `${b}@getsweepr.com`,
      name: BOX_NAMES[b],
      unread: byBox.get(b)?.unread ?? 0,
      total: byBox.get(b)?.total ?? 0,
      inboxCount: byBox.get(b)?.inbox_count ?? 0,
      sentCount: byBox.get(b)?.sent_count ?? 0,
    })),
  });
});

// ─── Messages ─────────────────────────────────────────────────────────────────

const FOLDERS = ["inbox", "sent", "archive"] as const;
type Folder = (typeof FOLDERS)[number];

adminMailRouter.get("/:box/messages", async (c) => {
  const box = c.req.param("box");
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;
  const user = (await getUserByClerkId(sql, clerkId)) as DbUser | null;
  if (!user) return c.json({ error: "User not found" }, 404);

  const boxes = await accessibleBoxes(sql, user, clerkId, c.env);
  if (!boxes.includes(box as Mailbox)) return c.json({ error: "Forbidden" }, 403);

  const folderParam = c.req.query("folder");
  const folder: Folder = (FOLDERS as readonly string[]).includes(folderParam ?? "")
    ? (folderParam as Folder)
    : "inbox";
  const q = c.req.query("q")?.trim();
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 300);
  const offset = parseInt(c.req.query("offset") ?? "0", 10) || 0;

  // folder: inbox = inbound + not archived; sent = outbound; archive = archived_at set.
  const folderCond =
    folder === "sent"
      ? sql`m.direction = 'outbound'`
      : folder === "archive"
        ? sql`m.archived_at IS NOT NULL`
        : sql`m.direction = 'inbound' AND m.archived_at IS NULL`;

  const searchCond = q
    ? sql`AND (m.subject ILIKE ${`%${q}%`} OR m.body_text ILIKE ${`%${q}%`}
           OR m.sender_email ILIKE ${`%${q}%`} OR m.to_email ILIKE ${`%${q}%`})`
    : sql``;

  const messages = await sql`
    SELECT m.id, m.direction, m.sender_email, m.sender_name, m.to_email, m.cc_email,
           m.subject, m.body_text, m.in_reply_to, m.read_at, m.archived_at, m.created_at,
           u.email AS sent_by_email
    FROM mailbox_messages m
    LEFT JOIN users u ON u.id = m.sent_by
    WHERE m.mailbox = ${box} AND ${folderCond} ${searchCond}
    ORDER BY m.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return c.json({ messages, limit, offset, folder });
});

adminMailRouter.post("/:box/messages/:id/read", async (c) => {
  const { box, id } = c.req.param();
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;
  const user = (await getUserByClerkId(sql, clerkId)) as DbUser | null;
  if (!user) return c.json({ error: "User not found" }, 404);

  const boxes = await accessibleBoxes(sql, user, clerkId, c.env);
  if (!boxes.includes(box as Mailbox)) return c.json({ error: "Forbidden" }, 403);

  const unread = c.req.query("unread") === "true";
  await sql`
    UPDATE mailbox_messages
    SET read_at = ${unread ? null : new Date().toISOString()}
    WHERE id = ${id} AND mailbox = ${box}
  `;
  return c.json({ ok: true });
});

adminMailRouter.post("/:box/messages/:id/unread", async (c) => {
  const { box, id } = c.req.param();
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;
  const user = (await getUserByClerkId(sql, clerkId)) as DbUser | null;
  if (!user) return c.json({ error: "User not found" }, 404);
  const boxes = await accessibleBoxes(sql, user, clerkId, c.env);
  if (!boxes.includes(box as Mailbox)) return c.json({ error: "Forbidden" }, 403);

  await sql`UPDATE mailbox_messages SET read_at = NULL WHERE id = ${id} AND mailbox = ${box}`;
  return c.json({ ok: true });
});

adminMailRouter.post("/:box/messages/:id/archive", async (c) => {
  const { box, id } = c.req.param();
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;
  const user = (await getUserByClerkId(sql, clerkId)) as DbUser | null;
  if (!user) return c.json({ error: "User not found" }, 404);
  const boxes = await accessibleBoxes(sql, user, clerkId, c.env);
  if (!boxes.includes(box as Mailbox)) return c.json({ error: "Forbidden" }, 403);

  await sql`UPDATE mailbox_messages SET archived_at = NOW() WHERE id = ${id} AND mailbox = ${box}`;
  return c.json({ ok: true });
});

adminMailRouter.post("/:box/messages/:id/unarchive", async (c) => {
  const { box, id } = c.req.param();
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;
  const user = (await getUserByClerkId(sql, clerkId)) as DbUser | null;
  if (!user) return c.json({ error: "User not found" }, 404);
  const boxes = await accessibleBoxes(sql, user, clerkId, c.env);
  if (!boxes.includes(box as Mailbox)) return c.json({ error: "Forbidden" }, 403);

  await sql`UPDATE mailbox_messages SET archived_at = NULL WHERE id = ${id} AND mailbox = ${box}`;
  return c.json({ ok: true });
});

// ─── Send / reply ─────────────────────────────────────────────────────────────

const sendSchema = z.object({
  to: z.string().email(),
  cc: z.string().email().optional(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(50_000),
  inReplyTo: z.string().uuid().optional(),
});

adminMailRouter.post("/:box/send", zValidator("json", sendSchema), async (c) => {
  const box = c.req.param("box");
  const { to, cc, subject, body } = c.req.valid("json");
  const inReplyTo = c.req.valid("json").inReplyTo ?? null;
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;
  const user = (await getUserByClerkId(sql, clerkId)) as DbUser | null;
  if (!user) return c.json({ error: "User not found" }, 404);

  const boxes = await accessibleBoxes(sql, user, clerkId, c.env);
  if (!boxes.includes(box as Mailbox)) return c.json({ error: "Forbidden" }, 403);

  if (!c.env.MAILERSEND_API_KEY) return c.json({ error: "Email sending not configured" }, 503);

  try {
    await sendEmail(c.env.MAILERSEND_API_KEY, {
      to,
      subject,
      html: wrapBodyInTemplate(subject, body),
      from: { email: `${box}@getsweepr.com`, name: BOX_NAMES[box as Mailbox] },
      replyTo: { email: `${box}@getsweepr.com`, name: BOX_NAMES[box as Mailbox] },
      // This route already records its own richer outbound row (with cc,
      // in_reply_to, sent_by) below — skip mailer.ts's generic auto-insert.
      recordOutbound: false,
    });
  } catch (err) {
    logger.error("admin mail send failed", err, { box, to });
    return c.json({ error: "Send failed" }, 502);
  }

  const rows = (await sql`
    INSERT INTO mailbox_messages
      (mailbox, direction, sender_email, sender_name, to_email, cc_email, subject, body_text, in_reply_to, sent_by, read_at)
    VALUES
      (${box}, 'outbound', ${`${box}@getsweepr.com`}, ${BOX_NAMES[box as Mailbox]},
       ${to}, ${cc ?? null}, ${subject}, ${body}, ${inReplyTo}, ${user.id}, NOW())
    RETURNING id
  `) as Array<{ id: string }>;

  return c.json({ ok: true, id: rows[0].id });
});

// ─── Permission management (super_admin only) ────────────────────────────────

const permGate = requireAdminRole("super_admin");

adminMailRouter.get("/permissions", permGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const [grants, admins] = await Promise.all([
    sql`
      SELECT p.id, p.user_id, p.mailbox, p.created_at,
             u.email, g.email AS granted_by_email
      FROM mailbox_permissions p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN users g ON g.id = p.granted_by
      ORDER BY u.email, p.mailbox
    `,
    sql`
      SELECT id, email, role, admin_role FROM users
      WHERE role IN ('admin', 'super_admin')
      ORDER BY email
    `,
  ]);
  return c.json({ grants, admins, mailboxes: MAILBOXES });
});

adminMailRouter.post(
  "/permissions",
  permGate,
  zValidator("json", z.object({ userId: z.string().uuid(), mailbox: z.enum(MAILBOXES) })),
  async (c) => {
    const { userId, mailbox } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const actor = (await getUserByClerkId(sql, c.get("user").clerkId)) as DbUser | null;

    await sql`
      INSERT INTO mailbox_permissions (user_id, mailbox, granted_by)
      VALUES (${userId}, ${mailbox}, ${actor?.id ?? null})
      ON CONFLICT (user_id, mailbox) DO NOTHING
    `;
    return c.json({ ok: true });
  },
);

adminMailRouter.delete("/permissions/:id", permGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  await sql`DELETE FROM mailbox_permissions WHERE id = ${c.req.param("id")}`;
  return c.json({ ok: true });
});
