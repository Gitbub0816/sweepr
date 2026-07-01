/**
 * Outbound SMS — the ONLY path allowed to send text messages.
 *
 * Every send re-verifies consent against the DB (never trust a cached flag)
 * and is restricted to a transactional allowlist. Marketing is intentionally
 * NOT a valid type here — future marketing SMS requires a completely separate
 * opt-in and its own sending path.
 *
 * Sends via the MailerSend SMS API (same MAILERSEND_API_KEY used for email)
 * when MAILERSEND_SMS_FROM is configured; otherwise logs and no-ops so the
 * rest of the flow (consent storage, auditing) still works in every
 * environment.
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

/** Normalize a stored phone to E.164 (MailerSend requires it). US default. */
export function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+") && digits.length >= 10) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

async function mailersendSmsSend(env: Env, to: string, body: string): Promise<void> {
  const apiKey = env.MAILERSEND_API_KEY;
  const from = env.MAILERSEND_SMS_FROM;
  if (!apiKey || !from) {
    logger.info("sms: MailerSend SMS not configured — skipping send", { to: to.slice(-4) });
    return;
  }
  const e164 = toE164(to);
  if (!e164) {
    logger.warn("sms: invalid phone number — skipping send", { to: to.slice(-4) });
    return;
  }
  const res = await fetch("https://api.mailersend.com/v1/sms", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [e164], text: body }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`MailerSend SMS send failed (${res.status}): ${detail.slice(0, 200)}`);
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
  await mailersendSmsSend(env, opts.to, opts.body);
  logger.info("sms: sent", { type: opts.type, userId: opts.userId });
}

/**
 * Carrier-mandated replies (STOP/START/HELP confirmations) are exempt from the
 * consent check — they are required responses to an inbound message from the
 * subscriber, not proactive notifications.
 */
export async function sendCarrierReply(env: Env, to: string, body: string): Promise<void> {
  await mailersendSmsSend(env, to, body);
}
