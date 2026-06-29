/**
 * IT inbound email → tickets (IT@getsweepr.com via MailerSend inbound route).
 *
 *   POST /it-mail/inbound   creates an IT ticket + sends the IT auto-reply.
 *
 * Mirrors the security inbox: signature-verified, generates a Case Code +
 * Ticket ID, and logs the inbound message as a ticket comment.
 */
import { Hono } from "hono";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";
import { sendEmail, SENDERS, TEMPLATES, formatEmailTimestamp } from "../lib/mailer";
import { generateTicketId } from "../lib/ticketId";
import type { AppBindings } from "../types";

export const itInboundRouter = new Hono<AppBindings>();

/** Classify inbound IT mail → { dbCategory (enum), code (3-letter), label }. */
function classifyIt(subject: string, body: string): { dbCategory: string; code: string; label: string } {
  const t = `${subject} ${body}`.toLowerCase();
  if (/slack/.test(t)) return { dbCategory: "technical", code: "SLK", label: "Slack" };
  if (/\bvpn\b/.test(t)) return { dbCategory: "technical", code: "VPN", label: "VPN" };
  if (/email|smtp|mailbox|inbox/.test(t)) return { dbCategory: "technical", code: "EML", label: "Email" };
  if (/network|wifi|connection|dns/.test(t)) return { dbCategory: "technical", code: "NET", label: "Network" };
  if (/printer|peripheral/.test(t)) return { dbCategory: "technical", code: "PRN", label: "Printer" };
  if (/database|\bsql\b|neon/.test(t)) return { dbCategory: "technical", code: "DBA", label: "Database" };
  if (/\bapi\b|integration|webhook/.test(t)) return { dbCategory: "technical", code: "API", label: "API" };
  if (/payment|payout|stripe|billing|invoice/.test(t)) return { dbCategory: "billing", code: "PAY", label: "Payments" };
  if (/login|password|account|2fa|locked|access/.test(t)) return { dbCategory: "account", code: "ACC", label: "Account Access" };
  if (/auth|sso|token/.test(t)) return { dbCategory: "account", code: "AUT", label: "Authentication" };
  if (/bug|error|crash|broken|exception/.test(t)) return { dbCategory: "bug", code: "BUG", label: "Bug" };
  if (/device|laptop|hardware|phone/.test(t)) return { dbCategory: "technical", code: "DEV", label: "Device" };
  if (/config|setting/.test(t)) return { dbCategory: "technical", code: "CFG", label: "Configuration" };
  return { dbCategory: "other", code: "OTH", label: "Other" };
}

async function hmacHex(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

itInboundRouter.post("/inbound", async (c) => {
  const raw = await c.req.text();
  // Verify against the IT inbound route's own signing secret.
  if (c.env.MAILERSEND_IT_INBOUND_SECRET) {
    const sig = c.req.header("signature") ?? c.req.header("x-mailersend-signature") ?? "";
    if (sig !== (await hmacHex(c.env.MAILERSEND_IT_INBOUND_SECRET, raw))) return c.json({ error: "bad signature" }, 401);
  }
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(raw || "{}"); } catch { return c.json({ error: "bad json" }, 400); }
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const from = (data.from ?? {}) as { email?: string; name?: string };
  const senderEmail = from.email ?? (data.sender as string) ?? "";
  if (!senderEmail) return c.json({ ok: true });
  const subject = (data.subject as string) ?? "(no subject)";
  const bodyText = (data.text as string) ?? (data.html ? stripHtml(data.html as string) : "");
  const messageId = (data.id as string) ?? (data.message_id as string) ?? null;

  const sql = getDb(c.env.DATABASE_URL);
  const cls = classifyIt(subject, bodyText);
  const receivedAt = new Date();
  const gen = generateTicketId("IT", cls.code, receivedAt);

  const rows = (await sql`
    INSERT INTO it_tickets (title, description, category, priority, source, reporter_email,
      ticket_id, case_code, ticket_prefix, encoded_date, encoded_time, issue_type, hex_suffix, context)
    VALUES (${subject}, ${bodyText}, ${cls.dbCategory}, 'normal', 'user_report', ${senderEmail},
      ${gen.ticketId}, ${gen.caseCode}, 'IT', ${gen.encodedDate}, ${gen.encodedTime}, ${gen.issueType}, ${gen.hex},
      ${JSON.stringify({ inbound: true, message_id: messageId, classification: cls.label })})
    RETURNING id
  `) as Array<{ id: string }>;
  const ticketId = rows[0].id;

  await sql`
    INSERT INTO it_ticket_comments (ticket_id, author_email, is_admin, body)
    VALUES (${ticketId}, ${senderEmail}, FALSE, ${bodyText})
  `;

  if (c.env.MAILERSEND_API_KEY) {
    try {
      await sendEmail(c.env.MAILERSEND_API_KEY, {
        to: senderEmail,
        subject: `Sweepr IT — Request Received (${gen.caseCode})`,
        from: SENDERS.IT,
        replyTo: SENDERS.IT,
        templateId: TEMPLATES.IT_AUTOREPLY,
        variables: {
          case_code: gen.caseCode,
          ticket_id: gen.ticketId,
          received_at: formatEmailTimestamp(receivedAt),
          it_classification: cls.label,
        },
      });
    } catch (err) {
      logger.error("it.autoreply failed", err, { caseCode: gen.caseCode });
    }
  }
  return c.json({ ok: true, case_code: gen.caseCode, ticket_id: gen.ticketId });
});
