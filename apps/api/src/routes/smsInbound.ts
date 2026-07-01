/**
 * MailerSend inbound SMS webhook — carrier-mandated STOP / START / HELP.
 *
 *   POST /webhooks/mailersend-sms/inbound
 *
 * Signature-verified against MAILERSEND_SMS_INBOUND_SECRET (HMAC-SHA256 of
 * the raw body — same scheme as the IT/security inbound email routes).
 * Fails closed when the secret is not configured.
 *
 * STOP  -> revoke consent (preserving the original grant timestamp) + confirm.
 * START -> re-grant consent (source 'sms_start') + send opt-in confirmation.
 * HELP  -> support info reply.
 *
 * MailerSend inbound webhooks don't support synchronous replies, so
 * confirmations are sent back out through the MailerSend SMS send API.
 */
import { Hono } from "hono";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";
import { grantSmsConsent, revokeSmsConsent } from "../lib/smsConsent";
import { SMS_MESSAGES, sendCarrierReply } from "../lib/sms";
import type { AppBindings } from "../types";

export const smsInboundRouter = new Hono<AppBindings>();

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const START_WORDS = new Set(["start", "unstop", "yes"]);
const HELP_WORDS = new Set(["help", "info"]);

async function hmacHex(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

smsInboundRouter.post("/inbound", async (c) => {
  const raw = await c.req.text();
  if (!c.env.MAILERSEND_SMS_INBOUND_SECRET) {
    return c.json({ error: "Inbound not configured" }, 503);
  }
  const sig = c.req.header("signature") ?? c.req.header("x-mailersend-signature") ?? "";
  if (sig !== (await hmacHex(c.env.MAILERSEND_SMS_INBOUND_SECRET, raw))) {
    logger.warn("mailersend sms webhook: invalid signature");
    return c.json({ error: "bad signature" }, 401);
  }

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(raw || "{}"); } catch { return c.json({ error: "bad json" }, 400); }

  // MailerSend nests the message under data.sms; parse defensively.
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const sms = (data.sms ?? data) as Record<string, unknown>;
  const from = (sms.from as string) ?? "";
  const text = ((sms.text as string) ?? "").trim().toLowerCase();
  if (!from || !text) return c.json({ ok: true });

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

  if (STOP_WORDS.has(text)) {
    if (userId) {
      await revokeSmsConsent(sql, userId, { source: "sms_stop", phone: from });
    }
    // Confirm the opt-out even for unmatched numbers — carrier requirement.
    try { await sendCarrierReply(c.env, from, SMS_MESSAGES.optOutConfirmation); } catch (err) {
      logger.error("sms stop confirmation failed", err);
    }
    return c.json({ ok: true, action: "stop" });
  }

  if (START_WORDS.has(text)) {
    if (userId) {
      await grantSmsConsent(sql, userId, { source: "sms_start", phone: from });
      try { await sendCarrierReply(c.env, from, SMS_MESSAGES.optInConfirmation); } catch (err) {
        logger.error("sms start confirmation failed", err);
      }
      return c.json({ ok: true, action: "start" });
    }
    // No matching account — nothing to re-subscribe; point them at support.
    try { await sendCarrierReply(c.env, from, SMS_MESSAGES.help); } catch { /* best-effort */ }
    return c.json({ ok: true, action: "start_unmatched" });
  }

  if (HELP_WORDS.has(text)) {
    try { await sendCarrierReply(c.env, from, SMS_MESSAGES.help); } catch (err) {
      logger.error("sms help reply failed", err);
    }
    return c.json({ ok: true, action: "help" });
  }

  // Any other inbound message: acknowledge silently (no auto-reply).
  return c.json({ ok: true });
});
