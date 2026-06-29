/**
 * Thin MailerSend client.
 * Supports both raw HTML sends and template-based sends via template_id.
 */

export const TEMPLATES = {
  NEWSLETTER_CONFIRM: "x2p034732j9gzdrn",
  SUBSCRIBED_UPDATES: "jpzkmgq5v0ng059v",
  WAITLIST: "3z0vklo5wo747qrx",
  STATUS_UPDATE: "yzkq3403wrx4d796",
  ADMIN_INVITE: "k68zxl23qykgj905",
  ADMIN_APPROVAL_REQUEST: "0p7kx4x5o27g9yjr",
  SECURITY_AUTOREPLY: "neqvygmy58zg0p7w",
  SECURITY_MANUAL_RESPONSE: "vywj2lp512mg7oqz",
} as const;

/** Format a timestamp as MM/DD/YYYY HH:MM:SS TZ for admin/security emails. */
export function formatEmailTimestamp(date: Date = new Date(), tz = "UTC"): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(date.getUTCMonth() + 1)}/${p(date.getUTCDate())}/${date.getUTCFullYear()} ` +
    `${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())} ${tz}`;
}

/** Known sender identities (must be verified domains/aliases in MailerSend). */
export const SENDERS = {
  DEFAULT: { email: "hello@getsweepr.com", name: "Sweepr" },
  ADMIN: { email: "admin_no-reply@getsweepr.com", name: "Sweepr Admin" },
  SECURITY: { email: "security@getsweepr.com", name: "Sweepr Security" },
} as const;

/**
 * Wrap plain-text body paragraphs in the Sweepr branded email template.
 * Double newlines become paragraph breaks; single newlines become <br/>.
 */
export function wrapBodyInTemplate(subject: string, body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="font-size:15px;line-height:1.7;color:#444;margin:0 0 16px">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("\n  ");

  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111">
  <img src="https://getsweepr.com/logo.png" alt="Sweepr" style="height:36px;margin-bottom:28px" />
  <h1 style="font-size:22px;font-weight:700;margin:0 0 20px">${subject}</h1>
  ${paragraphs}
  <a href="https://getsweepr.com" style="display:inline-block;background:#14b8a6;color:#fff;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;margin-top:8px">Visit Sweepr</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb" />
  <p style="font-size:12px;color:#9ca3af;margin:0">You're receiving this from Sweepr.</p>
</div>`;
}

export interface SendEmailInput {
  to: string;
  toName?: string;
  subject: string;
  html?: string;
  templateId?: string;
  variables?: Record<string, string>;
  /** Sender override (defaults to hello@getsweepr.com). */
  from?: { email: string; name?: string };
  /** Reply-To address (e.g. security@ so replies thread back to the inbox). */
  replyTo?: { email: string; name?: string };
}

export async function sendEmail(
  apiKey: string,
  input: SendEmailInput
): Promise<void> {
  const body: Record<string, unknown> = {
    from: input.from ?? SENDERS.DEFAULT,
    to: [{ email: input.to, name: input.toName ?? input.to }],
    subject: input.subject,
  };
  if (input.replyTo) body.reply_to = input.replyTo;

  if (input.templateId) {
    body.template_id = input.templateId;
    if (input.variables) {
      body.personalization = [
        {
          email: input.to,
          data: input.variables,
        },
      ];
    }
  } else {
    body.html = input.html ?? "";
  }

  const res = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MailerSend failed (${res.status}): ${text}`);
  }
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
  html: string
): Promise<number> {
  const CHUNK = 500;
  let sent = 0;

  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk = recipients.slice(i, i + CHUNK);
    const messages = chunk.map((r) => ({
      from: { email: "hello@getsweepr.com", name: "Sweepr" },
      to: [{ email: r.email, name: r.name ?? r.email }],
      subject,
      html,
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
      const text = await res.text();
      throw new Error(`MailerSend bulk failed (${res.status}): ${text}`);
    }
    sent += chunk.length;
  }
  return sent;
}
