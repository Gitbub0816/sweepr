/**
 * Generic inbound mailboxes via MailerSend inbound routes.
 *
 *   POST /mail/inbound/:box   box ∈ caleb | kristin | news | updates | help | alerts
 *
 * MailerSend caps inbound routes at 5 per domain (IT@ and security@ hold two
 * slots), so the six boxes share two combined routes — caleb/kristin/news and
 * updates/help/alerts. Each combined route fans every caught message out to
 * all three sibling webhooks, each forward signed with its own secret; the
 * handler verifies the HMAC-SHA256 of the raw body against the box's secret
 * (same scheme as the IT/security inboxes, fails closed when unconfigured)
 * and then stores the message only if it was actually addressed to this box.
 * Messages land in mailbox_messages for the admin console; help@ also
 * notifies admins so support mail doesn't sit unseen.
 */
import { Hono } from "hono";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";
import type { AppBindings, Env } from "../types";

export const mailboxInboundRouter = new Hono<AppBindings>();

const BOX_SECRETS: Record<string, keyof Env> = {
  caleb: "MAILERSEND_CALEB_INBOUND_SECRET",
  kristin: "MAILERSEND_KRISTIN_INBOUND_SECRET",
  news: "MAILERSEND_NEWS_INBOUND_SECRET",
  updates: "MAILERSEND_UPDATES_INBOUND_SECRET",
  help: "MAILERSEND_HELP_INBOUND_SECRET",
  alerts: "MAILERSEND_ALERTS_INBOUND_SECRET",
};

async function hmacHex(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Pull every recipient email out of the inbound payload, tolerating the
 * shapes MailerSend uses (recipients.rcptTo[].email, recipients.to.data[],
 * bare strings/arrays, "Name <addr>" raw headers).
 */
function extractRecipientEmails(data: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const add = (v: unknown): void => {
    if (typeof v === "string") {
      for (const e of v.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []) out.add(e);
    } else if (Array.isArray(v)) {
      v.forEach(add);
    } else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      add(o.email);
      add(o.data);
      add(o.raw);
      add(o.rcptTo);
      add(o.to);
    }
  };
  add(data.recipients);
  add(data.to);
  return [...out];
}

mailboxInboundRouter.post("/inbound/:box", async (c) => {
  const box = c.req.param("box");
  const secretName = BOX_SECRETS[box];
  if (!secretName) return c.json({ error: "unknown mailbox" }, 404);

  const raw = await c.req.text();
  const sig = c.req.header("signature") ?? c.req.header("x-mailersend-signature") ?? "";

  // MailerSend probes the webhook when the inbound route is CREATED to verify
  // it returns 2xx — but the route's signing secret only exists after creation,
  // so the secret is necessarily unset during that probe. Accept it (without
  // processing) so the route can be provisioned. Once the secret is configured
  // as a wrangler secret, every real delivery is signature-verified below and
  // forged/unsigned posts are rejected — so this fails safe, not open.
  const secret = c.env[secretName] as string | undefined;
  if (!secret) return c.json({ ok: true, probe: true });

  if (!timingSafeEqual(sig, await hmacHex(secret, raw))) return c.json({ error: "bad signature" }, 401);

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(raw || "{}"); } catch { return c.json({ error: "bad json" }, 400); }
  const data = (payload.data ?? payload) as Record<string, unknown>;

  // Combined routes deliver every message to all three sibling webhooks; only
  // the box the mail was addressed to may store it. If the payload carries no
  // recognizable recipient, store rather than drop (duplicates beat lost mail).
  const recipients = extractRecipientEmails(data);
  if (recipients.length > 0 && !recipients.includes(`${box}@getsweepr.com`)) {
    return c.json({ ok: true, ignored: "recipient mismatch" });
  }

  const from = (data.from ?? {}) as { email?: string; name?: string };
  const senderEmail = from.email ?? (data.sender as string) ?? "";
  if (!senderEmail) return c.json({ ok: true });
  const subject = (data.subject as string) ?? "(no subject)";
  const bodyText = (data.text as string) ?? (data.html ? stripHtml(data.html as string) : "");
  const messageId = (data.id as string) ?? (data.message_id as string) ?? null;

  const sql = getDb(c.env.DATABASE_URL);
  await sql`
    INSERT INTO mailbox_messages (mailbox, sender_email, sender_name, subject, body_text, message_id)
    VALUES (${box}, ${senderEmail}, ${from.name ?? null}, ${subject}, ${bodyText}, ${messageId})
  `;

  // Support mail shouldn't sit unseen — ping the admin notification feed.
  if (box === "help") {
    try {
      await sql`
        INSERT INTO notifications (user_id, type, body, created_at)
        SELECT u.id, 'help_inbound', ${`New help@ email from ${senderEmail}: ${subject}`.slice(0, 500)}, NOW()
        FROM users u WHERE u.role IN ('admin', 'super_admin') LIMIT 5
      `;
    } catch (err) {
      logger.error("help inbound: admin notify failed", err);
    }
  }

  return c.json({ ok: true });
});
