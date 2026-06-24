import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { sendBulkEmail, wrapBodyInTemplate } from "../lib/mailer";
import { requireAuth } from "../middleware/auth";
import { audit } from "../lib/audit";
import type { AppBindings } from "../types";

export const adminNewsletterRouter = new Hono<AppBindings>();

const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

adminNewsletterRouter.use("*", requireAuth, requireAdmin);

interface SubscriberRow { id: string; email: string; created_at: string }

/** List all newsletter subscribers with count. */
adminNewsletterRouter.get("/subscribers", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = await sql`
    SELECT id, email, created_at FROM newsletter_subscribers ORDER BY created_at DESC
  ` as SubscriberRow[];
  return c.json({ subscribers: rows, total: rows.length });
});

const sendSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
  previewTo: z.string().email().optional(),
});

adminNewsletterRouter.post(
  "/send",
  zValidator("json", sendSchema),
  async (c) => {
    const { subject, body, previewTo } = c.req.valid("json");
    const html = wrapBodyInTemplate(subject, body);
    const sql = getDb(c.env.DATABASE_URL);

    if (previewTo) {
      const { sendEmail } = await import("../lib/mailer");
      await sendEmail(c.env.MAILERSEND_API_KEY, { to: previewTo, subject, html });
      return c.json({ ok: true, sent: 1, preview: true });
    }

    const rows = await sql`
      SELECT email FROM newsletter_subscribers ORDER BY created_at ASC
    ` as Array<{ email: string }>;

    if (rows.length === 0) return c.json({ ok: true, sent: 0 });

    const sent = await sendBulkEmail(
      c.env.MAILERSEND_API_KEY,
      rows.map((r) => ({ email: r.email })),
      subject,
      html
    );

    await audit(sql, {
      action: "admin.action",
      actorClerkId: c.get("user").clerkId,
      targetType: "newsletter",
      targetId: "bulk",
      metadata: { subject, recipientCount: sent },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({ ok: true, sent });
  }
);
