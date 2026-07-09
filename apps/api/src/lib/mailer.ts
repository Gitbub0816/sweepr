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
  ADMIN_INVITE: "3z0vklo5j2p47qrx",
  ADMIN_APPROVAL_REQUEST: "7dnvo4dyep345r86",
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

/** Escape a string for safe interpolation into HTML text/attributes. */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Sweepr brand palette for emails. Kept in one place so every template matches. */
export const EMAIL_BRAND = {
  accent: "#0d9488", // teal-600 — Sweepr primary
  accentDark: "#0f766e", // teal-700 — button hover/border
  ink: "#0f172a", // slate-900 — headings
  body: "#475569", // slate-600 — paragraph text
  muted: "#94a3b8", // slate-400 — footer text
  pageBg: "#eef2f5", // page background behind the card
  cardBg: "#ffffff",
  hairline: "#e2e8f0", // slate-200 — dividers
  logo: "https://objects.getsweepr.com/site_assets/public/Sweepr-logo.png",
} as const;

export interface EmailTemplateOptions {
  /**
   * Marketing emails must carry a visible unsubscribe mechanism in the body
   * (CAN-SPAM) — the List-Unsubscribe header alone is not sufficient.
   */
  unsubscribe?: boolean;
  /** Primary call-to-action button rendered under the body. */
  cta?: { label: string; url: string };
  /** Inbox preview text (hidden in the body). Falls back to the subject. */
  preheader?: string;
  /** Accent color hex for the top bar + button. Defaults to Sweepr teal. */
  accent?: string;
  /** Small note rendered under the divider, above the standard footer. */
  footerNote?: string;
}

/**
 * Wrap plain-text body paragraphs in the Sweepr branded email template.
 *
 * Table-based, inline-CSS, and single-column so it renders consistently across
 * email clients (Gmail, Outlook, Apple Mail) — no external CSS, flexbox, or
 * grid, all of which email clients strip or ignore. Double newlines become
 * paragraph breaks; single newlines become <br/>.
 *
 * Backward compatible: existing callers pass (subject, body) and get the
 * upgraded look for free. Pass `cta`, `preheader`, `accent`, or `footerNote`
 * via opts for richer transactional emails.
 */
export function wrapBodyInTemplate(
  subject: string,
  body: string,
  lang?: string,
  opts?: EmailTemplateOptions,
): string {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const accent = opts?.accent ?? EMAIL_BRAND.accent;
  const preheader = (opts?.preheader ?? subject).trim();

  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${EMAIL_BRAND.body}">${esc(p).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");

  const ctaBlock = opts?.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px">
              <tr><td style="border-radius:8px;background:${accent}">
                <a href="${esc(opts.cta.url)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${esc(opts.cta.label)}</a>
              </td></tr>
            </table>`
    : "";

  const footerNoteBlock = opts?.footerNote
    ? `<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${EMAIL_BRAND.muted}">${esc(opts.footerNote)}</p>`
    : "";

  const unsubBlock = opts?.unsubscribe
    ? `<p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:${EMAIL_BRAND.muted}">Don't want these emails? <a href="https://api.getsweepr.com/unsubscribe" style="color:${EMAIL_BRAND.accentDark};text-decoration:underline">Unsubscribe</a> at any time.<br/>Sweepr · a ClearKey Solutions product · 832 B St #B, Hayward, CA 94541</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="${esc(lang ?? "en")}" dir="${dir}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL_BRAND.pageBg};-webkit-text-size-adjust:100%">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL_BRAND.pageBg}">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${EMAIL_BRAND.cardBg};border-radius:14px;overflow:hidden;border:1px solid ${EMAIL_BRAND.hairline}">
      <tr><td style="height:4px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:36px 40px 40px" dir="${dir}">
        <img src="${EMAIL_BRAND.logo}" alt="Sweepr" height="34" style="height:34px;display:block;margin:0 0 26px;border:0"/>
        <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:${EMAIL_BRAND.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">${esc(subject)}</h1>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">${paragraphs}</div>
        ${ctaBlock}
        <hr style="margin:32px 0 20px;border:0;border-top:1px solid ${EMAIL_BRAND.hairline}"/>
        ${footerNoteBlock}
        <p style="margin:0;font-size:12px;line-height:1.6;color:${EMAIL_BRAND.muted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">You're receiving this because you have a Sweepr account.</p>
        ${unsubBlock}
      </td></tr>
    </table>
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
      <tr><td align="center" style="padding:18px 20px 0;font-size:11px;line-height:1.6;color:${EMAIL_BRAND.muted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
        © ${new Date().getUTCFullYear()} ClearKey Solutions, LLC · <a href="https://getsweepr.com" style="color:${EMAIL_BRAND.muted};text-decoration:underline">getsweepr.com</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
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
