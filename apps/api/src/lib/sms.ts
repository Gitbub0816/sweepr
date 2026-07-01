/**
 * Outbound SMS — the ONLY path allowed to send text messages.
 *
 * Every send re-verifies consent against the DB (never trust a cached flag)
 * and is restricted to a transactional allowlist. Marketing is intentionally
 * NOT a valid type here — future marketing SMS requires a completely separate
 * opt-in and its own sending path.
 *
 * Sends via the Twilio REST API when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 * TWILIO_FROM_NUMBER are configured; otherwise logs and no-ops so the rest of
 * the flow (consent storage, auditing) still works in every environment.
 */
import { logger } from "./logger";
import { assertSmsConsent } from "./smsConsent";
import type { Sql } from "./db";
import type { Env } from "../types";

/** Transactional-only message types permitted under the registration's use case. */
export type SmsMessageType =
  | "account_verification"
  | "otp"
  | "mfa"
  | "login_verification"
  | "password_reset"
  | "booking_confirmation"
  | "cleaner_assigned"
  | "cleaner_arriving"
  | "cleaner_checked_in"
  | "cleaning_completed"
  | "receipt_available"
  | "cancellation"
  | "reschedule"
  | "customer_support"
  | "consent_confirmation";

/** Carrier-required canned replies/confirmations. */
export const SMS_MESSAGES = {
  optInConfirmation:
    "Sweepr: You have successfully subscribed to receive SMS messages from Sweepr for account security, booking updates, and service notifications. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance.",
  optOutConfirmation:
    "Sweepr: You have successfully opted out of SMS messages. You will no longer receive text messages from Sweepr. Reply START to opt back in.",
  help:
    "Sweepr: For assistance, contact support@getsweepr.com or visit https://getsweepr.com/support. Reply STOP to unsubscribe. Message frequency varies. Message and data rates may apply.",
} as const;

async function twilioSend(env: Env, to: string, body: string): Promise<void> {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    logger.info("sms: Twilio not configured — skipping send", { to: to.slice(-4) });
    return;
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Twilio send failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}

/**
 * Send a transactional SMS to a consented user. Throws if the user has not
 * consented (or has revoked). `type` is required so every send is classified
 * against the allowlist.
 */
export async function sendSms(
  env: Env,
  sql: Sql,
  opts: { userId: string; to: string; type: SmsMessageType; body: string },
): Promise<void> {
  await assertSmsConsent(sql, opts.userId);
  await twilioSend(env, opts.to, opts.body);
  logger.info("sms: sent", { type: opts.type, userId: opts.userId });
}

/**
 * Carrier-mandated replies (STOP/START/HELP confirmations) are exempt from the
 * consent check — they are required responses to an inbound message from the
 * subscriber, not proactive notifications.
 */
export async function sendCarrierReply(env: Env, to: string, body: string): Promise<void> {
  await twilioSend(env, to, body);
}
