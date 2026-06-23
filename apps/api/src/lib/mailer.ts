/**
 * Thin MailerSend client. Email HTML is built in @sweepr/utils; this just sends.
 */
export interface SendEmailInput {
  to: string;
  toName?: string;
  subject: string;
  html: string;
}

export async function sendEmail(
  apiKey: string,
  input: SendEmailInput
): Promise<void> {
  const res = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { email: "hello@getsweepr.com", name: "Sweepr" },
      to: [{ email: input.to, name: input.toName ?? input.to }],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MailerSend failed (${res.status}): ${body}`);
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
      const body = await res.text();
      throw new Error(`MailerSend bulk failed (${res.status}): ${body}`);
    }
    sent += chunk.length;
  }
  return sent;
}
