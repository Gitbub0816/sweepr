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
 * Inbound mailboxes for the Mail tab — single dispatcher.
 *
 *   POST /mail/inbound          (primary) files a message into the box it was
 *                               addressed to, derived from the payload recipients
 *   POST /mail/inbound/:box     (legacy)  files only mail addressed to :box
 *
 * MailerSend caps inbound routes at 5 per domain (IT@ and security@ hold two
 * slots), so the six shared boxes — caleb, kristin, news, updates, help,
 * alerts — are served by two combined routes. Rather than fanning each message
 * out to a different per-box webhook (six routes, duplicate delivery), both
 * combined routes forward to this ONE endpoint and the handler dispatches by
 * recipient. The signature is verified against any configured inbound signing
 * secret (per-route or per-box), so this works whether the routes point at the
 * single dispatcher or, during migration, still fan out to /:box.
 *
 * Fails closed once secrets are configured; before that it acks MailerSend's
 * create-time probe so routes can be provisioned. Messages land in
 * mailbox_messages; every box also raises a 'mail' admin alert (each admin's
 * alert preferences decide whether/how it's delivered) so inbound mail isn't
 * missed.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { getDb } from "../lib/db";
import { sanitizeEmailHtml, looksLikeRichHtml } from "../lib/emailHtml";
import { alertAdminsFromContext } from "../lib/adminAlerts";
import type { AppBindings, Env } from "../types";

export const mailboxInboundRouter = new Hono<AppBindings>();

/** The six shared boxes surfaced in the admin Mail tab. */
export const KNOWN_BOXES = ["caleb", "kristin", "news", "updates", "help", "alerts"] as const;
export type Box = (typeof KNOWN_BOXES)[number];

/**
 * Decide which box(es) a delivery files into. Pure so it's unit-testable.
 *  - boxHint set (legacy /:box): store only if addressed to that box, else
 *    "ignore" (so sibling fan-out deliveries don't duplicate).
 *  - no hint (primary /inbound): every recognized recipient box; if none is
 *    recognizable, file to help rather than drop.
 */
export function boxesForRecipients(recipients: string[], boxHint: Box | null): Box[] | "ignore" {
  if (boxHint) {
    if (recipients.length > 0 && !recipients.includes(`${boxHint}@getsweepr.com`)) return "ignore";
    return [boxHint];
  }
  const boxes = KNOWN_BOXES.filter((b) => recipients.includes(`${b}@getsweepr.com`));
  return boxes.length === 0 ? ["help"] : boxes;
}

/**
 * Every inbound signing secret a delivery could be signed with: the two
 * combined-route secrets, plus the legacy per-box secrets. Verifying against
 * the set keeps the handler correct across the migration and regardless of
 * whether MailerSend signs per-route or per-forward.
 */
const INBOUND_SECRET_KEYS: (keyof Env)[] = [
  "MAILERSEND_INBOUND_SECRET_1",
  "MAILERSEND_INBOUND_SECRET_2",
  "MAILERSEND_CALEB_INBOUND_SECRET",
  "MAILERSEND_KRISTIN_INBOUND_SECRET",
  "MAILERSEND_NEWS_INBOUND_SECRET",
  "MAILERSEND_UPDATES_INBOUND_SECRET",
  "MAILERSEND_HELP_INBOUND_SECRET",
  "MAILERSEND_ALERTS_INBOUND_SECRET",
];

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
 * Pull every recipient email out of the inbound payload, tolerating the shapes
 * MailerSend uses (recipients.rcptTo[].email, recipients.to.data[], bare
 * strings/arrays, "Name <addr>" raw headers).
 */
export function extractRecipientEmails(data: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const add = (v: unknown): void => {
    if (typeof v === "string") {
      for (const e of v.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []) out.add(e);
    } else if (Array.isArray(v)) {
      v.forEach(add);
    } else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      add(o.email); add(o.data); add(o.raw); add(o.rcptTo); add(o.to); add(o.cc);
    }
  };
  add(data.recipients);
  add(data.to);
  return [...out];
}

async function storeToBox(
  sql: ReturnType<typeof getDb>,
  box: Box,
  msg: { senderEmail: string; senderName: string | null; subject: string; bodyText: string; bodyHtml: string | null; messageId: string | null },
): Promise<void> {
  await sql`
    INSERT INTO mailbox_messages (mailbox, sender_email, sender_name, subject, body_text, body_html, message_id)
    VALUES (${box}, ${msg.senderEmail}, ${msg.senderName}, ${msg.subject}, ${msg.bodyText}, ${msg.bodyHtml}, ${msg.messageId})
  `;
}

/**
 * Shared handler. `boxHint` is set only by the legacy /:box endpoint, where it
 * filters (for dedup) to mail actually addressed to that box; the primary
 * endpoint passes none and dispatches to every recognized recipient box.
 */
async function handleInbound(
  c: Context<AppBindings>,
  boxHint: Box | null,
): Promise<Response> {
  const raw = await c.req.text();
  const sig = c.req.header("signature") ?? c.req.header("x-mailersend-signature") ?? "";

  const secrets = INBOUND_SECRET_KEYS
    .map((k) => c.env[k] as string | undefined)
    .filter((s): s is string => !!s);

  // Signature posture:
  //  - Secrets configured → verify strictly; forged posts are rejected.
  //  - No secret configured yet → we CANNOT verify, but dropping real mail is
  //    worse than accepting a spoofing window that only exists pre-config.
  //    MailerSend's create-time probe (empty payload) is acked without storing;
  //    payload-bearing deliveries are stored with an [unverified] subject tag
  //    so the reader knows the sender wasn't authenticated. Set the
  //    MAILERSEND_INBOUND_SECRET_* wrangler secrets to close the window.
  let unverified = false;
  if (secrets.length === 0) {
    unverified = true;
  } else {
    const expected = await Promise.all(secrets.map((s) => hmacHex(s, raw)));
    if (!expected.some((e) => timingSafeEqual(sig, e))) return c.json({ error: "bad signature" }, 401);
  }

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(raw || "{}"); } catch { return c.json({ error: "bad json" }, 400); }
  const data = (payload.data ?? payload) as Record<string, unknown>;

  // MailerSend's route-creation probe has no meaningful payload — ack it
  // without storing (this is what lets routes be provisioned pre-secret).
  if (unverified && Object.keys(data).length === 0) return c.json({ ok: true, probe: true });

  const recipients = extractRecipientEmails(data);
  const dispatch = boxesForRecipients(recipients, boxHint);
  if (dispatch === "ignore") return c.json({ ok: true, ignored: "recipient mismatch" });
  const boxes = dispatch;

  const from = (data.from ?? {}) as { email?: string; name?: string };
  const senderEmail = from.email ?? (data.sender as string) ?? "";
  if (!senderEmail) return c.json({ ok: true });
  const msg = {
    senderEmail,
    senderName: from.name ?? null,
    subject: `${unverified ? "[unverified] " : ""}${(data.subject as string) ?? "(no subject)"}`,
    bodyText: (data.text as string) ?? (data.html ? stripHtml(data.html as string) : ""),
    // Sanitized server-side once at ingest; the reader renders it verbatim.
    bodyHtml: (() => {
      const sanitized = data.html ? sanitizeEmailHtml(data.html as string) : "";
      return looksLikeRichHtml(sanitized) ? sanitized : null;
    })(),
    messageId: (data.id as string) ?? (data.message_id as string) ?? null,
  };

  const sql = getDb(c.env.DATABASE_URL);
  for (const box of boxes) await storeToBox(sql, box, msg);

  // Inbound mail shouldn't sit unseen — raise a 'mail' alert per box; each
  // admin's alert preferences decide the delivery channels.
  for (const box of boxes) {
    alertAdminsFromContext(c, {
      category: "mail",
      title: `New ${box}@ email from ${msg.senderEmail}`,
      body: msg.subject.slice(0, 500),
      linkPath: "/mail",
      dedupeKey: msg.messageId ? `${box}:${msg.messageId}` : null,
    });
  }

  return c.json({ ok: true, stored: boxes });
}

// Primary: one endpoint, dispatch by recipient.
mailboxInboundRouter.post("/inbound", (c) => handleInbound(c, null));

// Legacy: per-box endpoint kept for any route still pointed at it during the
// migration to the single dispatcher. Files only mail addressed to :box.
mailboxInboundRouter.post("/inbound/:box", (c) => {
  const box = c.req.param("box");
  if (!KNOWN_BOXES.includes(box as Box)) return c.json({ error: "unknown mailbox" }, 404);
  return handleInbound(c, box as Box);
});
