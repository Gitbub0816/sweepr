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
      from: { email: "hello@sweep-r.com", name: "Sweepr" },
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
