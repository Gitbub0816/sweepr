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
 * Thin MailerSend client with deliverability features:
 * - Suppression check (hard bounces, spam complaints, manual blocks)
 * - Delivery log (every send attempt recorded)
 * - plain-text fallback auto-generated from body/html
 * - List-Unsubscribe header only for marketing emails
 * - Provider message ID captured from X-Message-Id response header
 */
import { logger } from "./logger";

export const TEMPLATES = {
  NEWSLETTER_CONFIRM: "x2p034732j9gzdrn",
  SUBSCRIBED_UPDATES: "jpzkmgq5v0ng059v",
  WAITLIST: "3z0vklo5wo747qrx",
  STATUS_UPDATE: "yzkq3403wrx4d796",
  ADMIN_INVITE: "k68zxl23qykgj905",
  ADMIN_APPROVAL_REQUEST: "0p7kx4x5o27g9yjr",
  SECURITY_AUTOREPLY: "neqvygmy58zg0p7w",
  SECURITY_MANUAL_RESPONSE: "vywj2lp512mg7oqz",
  IT_AUTOREPLY: "3zxk54v51x6ljy6v",
  IT_MANUAL_RESPONSE: "o65qngk17yolwr12",
} as const;

/** Format a timestamp as MM/DD/YYYY HH:MM:SS TZ for admin/security emails. */
export function formatEmailTimestamp(date: Date = new Date(), tz = "UTC"): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(date.getUTCMonth() + 1)}/${p(date.getUTCDate())}/${date.getUTCFullYear()} ` +
    `${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())} ${tz}`;
}

/** Known sender identities — all must be verified in MailerSend. */
export const SENDERS = {
  DEFAULT:   { email: "hello@getsweepr.com",     name: "Sweepr" },
  SUPPORT:   { email: "support@getsweepr.com",    name: "Sweepr Support" },
  ADMIN:     { email: "admin@getsweepr.com",      name: "Sweepr Admin" },
  SECURITY:  { email: "security@getsweepr.com",   name: "Sweepr Security" },
  IT:        { email: "it@getsweepr.com",         name: "Sweepr IT" },
  APPROVALS: { email: "approvals@getsweepr.com",  name: "Sweepr Approvals" },
  BOOKINGS:  { email: "bookings@getsweepr.com",   name: "Sweepr Bookings" },
  BILLING:   { email: "billing@getsweepr.com",    name: "Sweepr Billing" },
  ALERTS:    { email: "alerts@getsweepr.com",     name: "Sweepr Alerts" },
} as const;

/**
 * Wrap plain-text body paragraphs in the Sweepr branded email template.
 * Double newlines become paragraph breaks; single newlines become <br/>.
 */
export function wrapBodyInTemplate(
  subject: string,
  body: string,
  lang?: string,
  opts?: {
    /**
     * Marketing emails must carry a visible unsubscribe mechanism in the body
     * (CAN-SPAM) — the List-Unsubscribe header alone is not sufficient.
     */
    unsubscribe?: boolean;
  }
): string {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="font-size:15px;line-height:1.7;color:#444;margin:0 0 16px">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("\n  ");

  return `<div dir="${dir}" style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111">
  <img src="https://getsweepr.com/logo.png" alt="Sweepr" style="height:36px;margin-bottom:28px" />
  <h1 style="font-size:22px;font-weight:700;margin:0 0 20px">${subject.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</h1>
  ${paragraphs}
  <a href="https://getsweepr.com" style="display:inline-block;background:#14b8a6;color:#fff;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;margin-top:8px">Visit Sweepr</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb" />
  <p style="font-size:12px;color:#6b7280;margin:0">You're receiving this from Sweepr.</p>${opts?.unsubscribe ? `
  <p style="font-size:12px;color:#6b7280;margin:8px 0 0">Don't want these emails? <a href="https://api.getsweepr.com/unsubscribe" style="color:#0f766e;text-decoration:underline">Unsubscribe</a> at any time.</p>
  <p style="font-size:12px;color:#6b7280;margin:8px 0 0">Sweepr · a ClearKey Solutions product · 832 B St #B, Hayward, CA 94541</p>` : ""}
</div>`;
}

/** Strip HTML tags and collapse whitespace for a plain-text alternative. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type EmailCategory = "transactional" | "marketing";

export interface SendEmailInput {
  to: string;
  toName?: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  variables?: Record<string, string>;
  /** Sender override (defaults to hello@getsweepr.com). */
  from?: { email: string; name?: string };
  /** Reply-To address (e.g. security@ so replies thread back to the inbox). */
  replyTo?: { email: string; name?: string };
  /** Transactional (default) or marketing. Marketing emails get List-Unsubscribe. */
  category?: EmailCategory;
  /** For delivery log: what entity triggered this send. */
  relatedType?: string;
  relatedId?: string;
  /** Human-readable template name for the delivery log. */
  templateName?: string;
  /**
   * Set false to skip the automatic outbound `mailbox_messages` row. Callers
   * that already record a richer row themselves (e.g. the admin Mail Center,
   * which also tracks cc/in_reply_to/sent_by) opt out to avoid duplicates.
   * Defaults to true — every other caller (IT/Security manual replies,
   * transactional/system email, etc) gets recorded automatically so it shows
   * up in the Mail tab's Sent folder.
   */
  recordOutbound?: boolean;
}

/** Local-part of an email address, lowercased, or null if it doesn't parse. */
export function mailboxFromAddress(email: string | undefined | null): string | null {
  if (!email) return null;
  const local = email.split("@")[0]?.trim().toLowerCase();
  return local || null;
}

export interface DeliveryResult {
  status: "sent" | "failed" | "suppressed";
  providerMessageId: string | null;
  error?: string;
}

/** Low-level send; does not log or check suppressions. */
async function callMailerSend(
  apiKey: string,
  input: SendEmailInput,
): Promise<{ ok: boolean; messageId: string | null; error?: string }> {
  const body: Record<string, unknown> = {
    from: input.from ?? SENDERS.DEFAULT,
    to: [{ email: input.to, name: input.toName ?? input.to }],
    subject: input.subject,
  };

  if (input.replyTo) body.reply_to = input.replyTo;

  if (input.category === "marketing") {
    // RFC 8058: include both https (for one-click POST) and mailto as fallback.
    const unsubUrl = `https://api.getsweepr.com/unsubscribe?email=${encodeURIComponent(input.to)}`;
    body.headers = [
      { name: "List-Unsubscribe", value: `<${unsubUrl}>, <mailto:unsubscribe@getsweepr.com?subject=unsubscribe>` },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
    ];
  }

  if (input.templateId) {
    body.template_id = input.templateId;
    if (input.variables) {
      body.personalization = [{ email: input.to, data: input.variables }];
      body.variables = [
        {
          email: input.to,
          substitutions: Object.entries(input.variables).map(([k, v]) => ({
            var: k,
            value: String(v ?? ""),
          })),
        },
      ];
    }
  } else {
    const html = input.html ?? "";
    body.html = html;
    body.text = input.text ?? htmlToPlainText(html);
  }

  const res = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const messageId = res.headers.get("X-Message-Id") ?? res.headers.get("x-message-id") ?? null;
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, messageId: null, error: `MailerSend ${res.status}: ${text}` };
  }
  return { ok: true, messageId };
}

/**
 * Send an email with suppression check and delivery logging.
 * Pass `sql` from getDb to enable suppression + logging; omit for fire-and-forget.
 */
export async function sendEmail(
  apiKey: string,
  input: SendEmailInput,
  sql?: ReturnType<typeof import("../lib/db").getDb>,
): Promise<DeliveryResult> {
  const fromEmail = (input.from ?? SENDERS.DEFAULT).email;
  const replyToEmail = input.replyTo?.email ?? null;
  const subject = input.subject;

  // Check suppression list.
  if (sql) {
    const rows = (await sql`
      SELECT reason FROM email_suppressions
      WHERE LOWER(email) = LOWER(${input.to}) LIMIT 1
    `) as Array<{ reason: string }>;
    if (rows[0]) {
      await sql`
        INSERT INTO email_delivery_log
          (template_name, template_id, email_category, recipient, "from", reply_to, subject,
           status, related_type, related_id, error_message)
        VALUES (
          ${input.templateName ?? null}, ${input.templateId ?? null},
          ${input.category ?? "transactional"}, ${input.to}, ${fromEmail},
          ${replyToEmail}, ${subject}, 'suppressed',
          ${input.relatedType ?? null}, ${input.relatedId ?? null},
          ${`Suppressed: ${rows[0].reason}`}
        )
      `;
      return { status: "suppressed", providerMessageId: null, error: `Suppressed: ${rows[0].reason}` };
    }
  }

  // Send.
  const result = await callMailerSend(apiKey, input);

  // Log outcome.
  if (sql) {
    await sql`
      INSERT INTO email_delivery_log
        (template_name, template_id, email_category, recipient, "from", reply_to, subject,
         provider_message_id, status, related_type, related_id, error_message)
      VALUES (
        ${input.templateName ?? null}, ${input.templateId ?? null},
        ${input.category ?? "transactional"}, ${input.to}, ${fromEmail},
        ${replyToEmail}, ${subject}, ${result.messageId},
        ${result.ok ? "sent" : "failed"},
        ${input.relatedType ?? null}, ${input.relatedId ?? null},
        ${result.error ?? null}
      )
    `;
  }

  if (!result.ok) {
    throw new Error(result.error ?? "Email delivery failed");
  }

  // Mirror every successful outbound send into the Mail tab's backing store
  // (mailbox_messages) so IT/Security/system correspondence is visible there
  // too, not just the dedicated mail-center compose flow. Best-effort: a
  // failure here must never fail the send that already succeeded.
  if (sql && input.recordOutbound !== false) {
    try {
      const mailbox = mailboxFromAddress(fromEmail) ?? "alerts";
      const bodyText = input.text ?? (input.html ? htmlToPlainText(input.html) : "");
      await sql`
        INSERT INTO mailbox_messages
          (mailbox, direction, sender_email, sender_name, to_email, subject, body_text, read_at)
        VALUES
          (${mailbox}, 'outbound', ${fromEmail}, ${(input.from ?? SENDERS.DEFAULT).name ?? null},
           ${input.to}, ${subject}, ${bodyText}, NOW())
      `;
    } catch (err) {
      logger.warn("mailer.record_outbound_failed", { error: (err as Error)?.message, fromEmail });
    }
  }

  return { status: "sent", providerMessageId: result.messageId };
}

/**
 * Send the same email to many recipients using MailerSend bulk endpoint.
 * MailerSend bulk accepts up to 500 messages per call; we chunk automatically.
 * Returns the number of accepted messages.
 */
export async function sendBulkEmail(
  apiKey: string,
  recipients: Array<{ email: string; name?: string }>,
  subject: string,
  html: string,
  sql?: ReturnType<typeof import("../lib/db").getDb>,
): Promise<number> {
  const text = htmlToPlainText(html);
  const CHUNK = 500;
  const MAX_RECORDED_ROWS = 50;
  let sent = 0;
  let recorded = 0;

  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk = recipients.slice(i, i + CHUNK);
    const messages = chunk.map((r) => ({
      from: { email: "hello@getsweepr.com", name: "Sweepr" },
      to: [{ email: r.email, name: r.name ?? r.email }],
      subject,
      html,
      text,
    }));

    const res = await fetch("https://api.mailersend.com/v1/bulk-email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`MailerSend bulk failed (${res.status}): ${t}`);
    }
    sent += chunk.length;

    // Mirror into the Mail tab's backing store — best-effort, capped so a
    // large broadcast doesn't flood mailbox_messages with hundreds of rows.
    if (sql && recorded < MAX_RECORDED_ROWS) {
      const toRecord = chunk.slice(0, MAX_RECORDED_ROWS - recorded);
      try {
        for (const r of toRecord) {
          await sql`
            INSERT INTO mailbox_messages
              (mailbox, direction, sender_email, sender_name, to_email, subject, body_text, read_at)
            VALUES
              ('alerts', 'outbound', 'hello@getsweepr.com', 'Sweepr', ${r.email}, ${subject}, ${text}, NOW())
          `;
        }
        recorded += toRecord.length;
      } catch (err) {
        logger.warn("mailer.record_bulk_outbound_failed", { error: (err as Error)?.message });
      }
    }
  }
  return sent;
}
