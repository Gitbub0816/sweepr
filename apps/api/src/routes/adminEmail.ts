/**
 * Admin email management routes (super_admin only):
 *
 *   GET  /admin/email/delivery-log          recent delivery log entries
 *   GET  /admin/email/suppressions          suppression list
 *   POST /admin/email/suppressions          add manual suppression
 *   DELETE /admin/email/suppressions/:email remove suppression
 *   POST /admin/email/preview               send a test email to an address
 *
 *   POST /webhooks/mailersend               MailerSend event webhook (unauthenticated)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireAdminRole } from "../middleware/adminRoles";
import { getDb } from "../lib/db";
import { sendEmail, SENDERS } from "../lib/mailer";
import type { AppBindings } from "../types";

export const adminEmailRouter = new Hono<AppBindings>();
const gate = [requireAuth, requireAdminRole("super_admin")] as const;

adminEmailRouter.get("/delivery-log", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const limit = Math.min(Number(c.req.query("limit") ?? 200), 500);
  const rows = await sql`
    SELECT id, template_name, template_id, email_category, recipient, "from", reply_to,
           subject, provider_message_id, status, related_type, related_id, error_message, sent_at
    FROM email_delivery_log
    ORDER BY sent_at DESC
    LIMIT ${limit}
  `;
  return c.json({ log: rows });
});

adminEmailRouter.get("/suppressions", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = await sql`
    SELECT id, email, reason, source, created_at FROM email_suppressions ORDER BY created_at DESC
  `;
  return c.json({ suppressions: rows });
});

adminEmailRouter.post(
  "/suppressions",
  ...gate,
  zValidator("json", z.object({
    email: z.string().email(),
    reason: z.enum(["hard_bounce", "spam_complaint", "manual_suppression", "invalid_address", "unsubscribed_marketing"]),
  })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const { email, reason } = c.req.valid("json");
    await sql`
      INSERT INTO email_suppressions (email, reason, source)
      VALUES (${email}, ${reason}, 'admin')
      ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason, source = 'admin', created_at = NOW()
    `;
    return c.json({ ok: true });
  },
);

adminEmailRouter.delete("/suppressions/:email", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const email = decodeURIComponent(c.req.param("email"));
  await sql`DELETE FROM email_suppressions WHERE LOWER(email) = LOWER(${email})`;
  return c.json({ ok: true });
});

adminEmailRouter.post(
  "/preview",
  ...gate,
  zValidator("json", z.object({
    to: z.string().email(),
    subject: z.string().min(1).max(200).default("Sweepr Email Preview"),
    body: z.string().min(1).max(8000),
  })),
  async (c) => {
    if (!c.env.MAILERSEND_API_KEY) return c.json({ error: "MAILERSEND_API_KEY not configured" }, 503);
    const sql = getDb(c.env.DATABASE_URL);
    const { to, subject, body } = c.req.valid("json");
    const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
  <p style="font-size:11px;color:#f59e0b;border:1px solid #f59e0b;padding:6px 10px;border-radius:4px;margin-bottom:20px">
    ⚠ This is a preview / test email sent from the Sweepr admin panel.
  </p>
  <h2 style="margin:0 0 16px;font-size:20px">${subject}</h2>
  <div style="font-size:15px;line-height:1.7;color:#444;white-space:pre-wrap">${body}</div>
</div>`;
    await sendEmail(
      c.env.MAILERSEND_API_KEY,
      { to, subject: `[Preview] ${subject}`, html, from: SENDERS.ADMIN, category: "transactional", templateName: "admin_preview" },
      sql,
    );
    return c.json({ ok: true });
  },
);

// ── MailerSend webhook (unauthenticated, signature-checked) ───────────────────
export const mailersendWebhookRouter = new Hono<AppBindings>();

mailersendWebhookRouter.post("/", async (c) => {
  const secret = c.env.MAILERSEND_WEBHOOK_SECRET;
  if (secret) {
    const sig = c.req.header("signature") ?? "";
    const raw = await c.req.text();
    // MailerSend signs with HMAC-SHA256 over the raw body.
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const sigBytes = Uint8Array.from(sig.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(raw));
    if (!valid) return c.json({ error: "bad signature" }, 401);

    const body = JSON.parse(raw) as { type?: string; data?: { email?: { recipient?: { email?: string } }; reason?: string } };
    const email = body.data?.email?.recipient?.email;
    if (!email) return c.json({ ok: true });

    const sql = getDb(c.env.DATABASE_URL);
    if (body.type === "activity.hard_bounced") {
      await sql`
        INSERT INTO email_suppressions (email, reason, source)
        VALUES (${email}, 'hard_bounce', 'mailersend_webhook')
        ON CONFLICT (email) DO UPDATE SET reason = 'hard_bounce', source = 'mailersend_webhook', created_at = NOW()
      `;
    } else if (body.type === "activity.spam_complaint") {
      await sql`
        INSERT INTO email_suppressions (email, reason, source)
        VALUES (${email}, 'spam_complaint', 'mailersend_webhook')
        ON CONFLICT (email) DO UPDATE SET reason = 'spam_complaint', source = 'mailersend_webhook', created_at = NOW()
      `;
    } else if (body.type === "activity.unsubscribed") {
      await sql`
        INSERT INTO email_suppressions (email, reason, source)
        VALUES (${email}, 'unsubscribed_marketing', 'mailersend_webhook')
        ON CONFLICT (email) DO UPDATE SET reason = 'unsubscribed_marketing', source = 'mailersend_webhook', created_at = NOW()
      `;
    }
    return c.json({ ok: true });
  }

  // No secret configured — parse body without signature verification.
  const body = await c.req.json() as { type?: string; data?: { email?: { recipient?: { email?: string } } } };
  const email = body.data?.email?.recipient?.email;
  if (!email) return c.json({ ok: true });

  const sql = getDb(c.env.DATABASE_URL);
  if (body.type === "activity.hard_bounced") {
    await sql`
      INSERT INTO email_suppressions (email, reason, source)
      VALUES (${email}, 'hard_bounce', 'mailersend_webhook')
      ON CONFLICT (email) DO UPDATE SET reason = 'hard_bounce', source = 'mailersend_webhook', created_at = NOW()
    `;
  } else if (body.type === "activity.spam_complaint") {
    await sql`
      INSERT INTO email_suppressions (email, reason, source)
      VALUES (${email}, 'spam_complaint', 'mailersend_webhook')
      ON CONFLICT (email) DO UPDATE SET reason = 'spam_complaint', source = 'mailersend_webhook', created_at = NOW()
    `;
  }
  return c.json({ ok: true });
});
