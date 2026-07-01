/**
 * Twilio inbound SMS webhook — carrier-mandated STOP / START / HELP handling.
 *
 *   POST /webhooks/twilio/sms
 *
 * Signature-verified (X-Twilio-Signature, HMAC-SHA1 over URL + sorted params).
 * Fails closed when TWILIO_AUTH_TOKEN is not configured.
 *
 * STOP  -> revoke consent (preserving the original grant timestamp) + confirm.
 * START -> re-grant consent (source 'sms_start') + confirm.
 * HELP  -> support info reply.
 *
 * Replies are returned as TwiML so Twilio sends them from the same number.
 */
import { Hono } from "hono";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";
import { grantSmsConsent, revokeSmsConsent } from "../lib/smsConsent";
import { SMS_MESSAGES } from "../lib/sms";
import type { AppBindings } from "../types";

export const twilioRouter = new Hono<AppBindings>();

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const START_WORDS = new Set(["start", "unstop", "yes"]);
const HELP_WORDS = new Set(["help", "info"]);

async function validTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string,
): Promise<boolean> {
  // Twilio spec: signature = base64(HMAC-SHA1(authToken, url + concat(sorted key+value))).
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

function twiml(message?: string): string {
  return message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}

twilioRouter.post("/sms", async (c) => {
  if (!c.env.TWILIO_AUTH_TOKEN) {
    return c.json({ error: "Webhook not configured" }, 503);
  }

  const form = await c.req.parseBody();
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(form)) {
    if (typeof v === "string") params[k] = v;
  }

  const signature = c.req.header("X-Twilio-Signature") ?? "";
  if (!(await validTwilioSignature(c.env.TWILIO_AUTH_TOKEN, c.req.url, params, signature))) {
    logger.warn("twilio webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const from = params["From"] ?? "";
  const body = (params["Body"] ?? "").trim().toLowerCase();
  if (!from) return c.body(twiml(), 200, { "Content-Type": "text/xml" });

  const sql = getDb(c.env.DATABASE_URL);

  // Match the sender to a user by phone (last 10 digits — storage formats vary).
  const digits = from.replace(/\D/g, "").slice(-10);
  const users = (await sql`
    SELECT u.id FROM users u
    LEFT JOIN customers cust ON cust.user_id = u.id
    LEFT JOIN cleaners cl ON cl.user_id = u.id
    WHERE RIGHT(regexp_replace(COALESCE(cust.phone, ''), '\\D', '', 'g'), 10) = ${digits}
       OR RIGHT(regexp_replace(COALESCE(cl.phone, ''), '\\D', '', 'g'), 10) = ${digits}
    LIMIT 1
  `) as Array<{ id: string }>;
  const userId = users[0]?.id ?? null;

  if (STOP_WORDS.has(body)) {
    if (userId) {
      await revokeSmsConsent(sql, userId, { source: "sms_stop", phone: from });
    }
    // Confirm the opt-out even for unmatched numbers — carrier requirement.
    return c.body(twiml(SMS_MESSAGES.optOutConfirmation), 200, { "Content-Type": "text/xml" });
  }

  if (START_WORDS.has(body)) {
    if (userId) {
      await grantSmsConsent(sql, userId, { source: "sms_start", phone: from });
      return c.body(twiml(SMS_MESSAGES.optInConfirmation), 200, { "Content-Type": "text/xml" });
    }
    // No matching account — nothing to re-subscribe.
    return c.body(twiml(SMS_MESSAGES.help), 200, { "Content-Type": "text/xml" });
  }

  if (HELP_WORDS.has(body)) {
    return c.body(twiml(SMS_MESSAGES.help), 200, { "Content-Type": "text/xml" });
  }

  // Any other inbound message: acknowledge silently (no auto-reply).
  return c.body(twiml(), 200, { "Content-Type": "text/xml" });
});
