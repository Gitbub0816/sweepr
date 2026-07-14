/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

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
import { translateToEnglish } from "../lib/translate";
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

adminEmailRouter.delete(
  "/suppressions/:email",
  ...gate,
  zValidator("param", z.object({ email: z.string().email() })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const { email } = c.req.valid("param");
    await sql`DELETE FROM email_suppressions WHERE LOWER(email) = LOWER(${email})`;
    return c.json({ ok: true });
  },
);

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
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
  <p style="font-size:11px;color:#f59e0b;border:1px solid #f59e0b;padding:6px 10px;border-radius:4px;margin-bottom:20px">
    &#x26A0; This is a preview / test email sent from the Sweepr admin panel.
  </p>
  <h2 style="margin:0 0 16px;font-size:20px">${esc(subject)}</h2>
  <div style="font-size:15px;line-height:1.7;color:#444;white-space:pre-wrap">${esc(body)}</div>
</div>`;
    await sendEmail(
      c.env.MAILERSEND_API_KEY,
      { to, subject: `[Preview] ${subject}`, html, from: SENDERS.ADMIN, category: "transactional", templateName: "admin_preview" },
      sql,
    );
    return c.json({ ok: true });
  },
);

/** Translate arbitrary text to English — used by admin console for inbound emails. */
adminEmailRouter.post(
  "/translate",
  ...gate,
  zValidator("json", z.object({ text: z.string().min(1).max(20000) })),
  async (c) => {
    if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: "ANTHROPIC_API_KEY not configured" }, 503);
    const { text } = c.req.valid("json");
    const translated = await translateToEnglish(c.env.ANTHROPIC_API_KEY, text);
    return c.json({ translated });
  },
);

// ── One-click unsubscribe (RFC 8058 — public POST, email in query param) ─────
export const unsubscribeRouter = new Hono<AppBindings>();

// Human-visitable unsubscribe page (CAN-SPAM: a clear and conspicuous
// mechanism inside the message body links here). Plain accessible HTML.
unsubscribeRouter.get("/", (c) => {
  const email = c.req.query("email") ?? "";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribe, Sweepr</title>
<style>body{font-family:sans-serif;max-width:26rem;margin:12vh auto;padding:0 1rem;color:#111}
label{display:block;font-weight:600;margin-bottom:.4rem}input{width:100%;padding:.6rem;font-size:1rem;border:1px solid #cbd5e1;border-radius:.5rem}
button{margin-top:1rem;padding:.6rem 1.4rem;font-size:1rem;font-weight:600;background:#0f766e;color:#fff;border:0;border-radius:.5rem;cursor:pointer}
button:focus-visible,input:focus-visible{outline:2px solid #0d9488;outline-offset:2px}
p[role=status]{font-weight:600}</style></head>
<body><h1>Unsubscribe from Sweepr marketing emails</h1>
<p>Enter your email address to stop receiving marketing messages. Transactional emails (receipts, booking updates) are unaffected.</p>
<form id="f"><label for="e">Email address</label>
<input id="e" name="email" type="email" required value="${esc(email)}" autocomplete="email">
<button type="submit">Unsubscribe</button></form>
<p role="status" aria-live="polite" id="m"></p>
<script>document.getElementById('f').addEventListener('submit',async function(ev){ev.preventDefault();
var e=document.getElementById('e').value,m=document.getElementById('m');
try{var r=await fetch('/unsubscribe?email='+encodeURIComponent(e),{method:'POST'});
m.textContent=r.ok?'You have been unsubscribed.':'Something went wrong - email unsubscribe@getsweepr.com instead.';}
catch(_){m.textContent='Something went wrong - email unsubscribe@getsweepr.com instead.';}});</script>
</body></html>`);
});

unsubscribeRouter.post("/", async (c) => {
  const emailParam = c.req.query("email") ?? "";
  const parsed = z.string().email().safeParse(decodeURIComponent(emailParam));
  if (!parsed.success) return c.json({ error: "Invalid email" }, 400);
  const email = parsed.data;
  const sql = getDb(c.env.DATABASE_URL);
  await sql`
    INSERT INTO email_suppressions (email, reason, source)
    VALUES (${email}, 'unsubscribed_marketing', 'one_click')
    ON CONFLICT (email) DO UPDATE SET reason = 'unsubscribed_marketing', source = 'one_click', created_at = NOW()
  `;
  return c.json({ ok: true });
});

// ── MailerSend webhook (signature-required) ───────────────────────────────────
export const mailersendWebhookRouter = new Hono<AppBindings>();

mailersendWebhookRouter.post("/", async (c) => {
  const secret = c.env.MAILERSEND_WEBHOOK_SECRET;
  // Fail-closed: reject all requests when the secret is not configured.
  if (!secret) return c.json({ error: "Webhook not configured" }, 503);

  const sig = c.req.header("signature") ?? "";
  const raw = await c.req.text();
  // sig is lowercase hex; parse before timing-safe compare.
  const sigBytes = Uint8Array.from(sig.match(/[0-9a-f]{2}/gi)?.map((b) => parseInt(b, 16)) ?? []);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  const valid = sigBytes.length > 0 &&
    await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(raw));
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
});
