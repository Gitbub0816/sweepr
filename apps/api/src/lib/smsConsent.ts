/**
 * A2P/TCPA SMS consent — single source of truth for granting, revoking, and
 * checking SMS consent.
 *
 * Rules (10DLC / toll-free / short-code / CTIA / TCPA):
 *  - Consent is explicit, never implied, never pre-checked.
 *  - Current state lives on users.sms_consent*; every change is ALSO appended
 *    to sms_consent_events so historical consent is never overwritten.
 *  - Revocation sets sms_consent=false + sms_consent_revoked_at but preserves
 *    the original sms_consent_at.
 *  - Consent is NOT a condition of using Sweepr.
 */
import type { Sql } from "./db";

/** Bump when the consent language shown to users changes. */
export const SMS_CONSENT_VERSION = "v1";

export type SmsConsentSource =
  | "onboarding"
  | "customer_settings"
  | "cleaner_settings"
  | "booking"
  | "sms_start"
  | "admin";

export interface SmsConsentState {
  smsConsent: boolean;
  smsConsentAt: string | null;
  smsConsentIp: string | null;
  smsConsentUserAgent: string | null;
  smsConsentVersion: string | null;
  smsConsentSource: string | null;
  smsConsentRevokedAt: string | null;
}

interface ConsentRow {
  sms_consent: boolean;
  sms_consent_at: string | null;
  sms_consent_ip: string | null;
  sms_consent_user_agent: string | null;
  sms_consent_version: string | null;
  sms_consent_source: string | null;
  sms_consent_revoked_at: string | null;
}

function toState(row: ConsentRow): SmsConsentState {
  return {
    smsConsent: row.sms_consent,
    smsConsentAt: row.sms_consent_at,
    smsConsentIp: row.sms_consent_ip,
    smsConsentUserAgent: row.sms_consent_user_agent,
    smsConsentVersion: row.sms_consent_version,
    smsConsentSource: row.sms_consent_source,
    smsConsentRevokedAt: row.sms_consent_revoked_at,
  };
}

export async function getSmsConsent(sql: Sql, userId: string): Promise<SmsConsentState | null> {
  const rows = (await sql`
    SELECT sms_consent, sms_consent_at, sms_consent_ip, sms_consent_user_agent,
           sms_consent_version, sms_consent_source, sms_consent_revoked_at
    FROM users WHERE id = ${userId} LIMIT 1
  `) as ConsentRow[];
  return rows[0] ? toState(rows[0]) : null;
}

export async function grantSmsConsent(
  sql: Sql,
  userId: string,
  opts: { source: SmsConsentSource; ip?: string | null; userAgent?: string | null; phone?: string | null },
): Promise<void> {
  await sql`
    UPDATE users SET
      sms_consent = TRUE,
      sms_consent_at = NOW(),
      sms_consent_ip = ${opts.ip ?? null},
      sms_consent_user_agent = ${opts.userAgent ?? null},
      sms_consent_version = ${SMS_CONSENT_VERSION},
      sms_consent_source = ${opts.source},
      sms_consent_revoked_at = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
  `;
  await sql`
    INSERT INTO sms_consent_events (user_id, action, source, consent_version, ip_address, user_agent, phone)
    VALUES (${userId}, 'granted', ${opts.source}, ${SMS_CONSENT_VERSION},
            ${opts.ip ?? null}, ${opts.userAgent ?? null}, ${opts.phone ?? null})
  `;
}

export async function revokeSmsConsent(
  sql: Sql,
  userId: string,
  opts: { source: SmsConsentSource | "sms_stop"; ip?: string | null; userAgent?: string | null; phone?: string | null },
): Promise<void> {
  // Preserve the original sms_consent_at — only flip the flag and stamp revocation.
  await sql`
    UPDATE users SET
      sms_consent = FALSE,
      sms_consent_revoked_at = NOW(),
      updated_at = NOW()
    WHERE id = ${userId}
  `;
  await sql`
    INSERT INTO sms_consent_events (user_id, action, source, consent_version, ip_address, user_agent, phone)
    VALUES (${userId}, 'revoked', ${opts.source}, ${SMS_CONSENT_VERSION},
            ${opts.ip ?? null}, ${opts.userAgent ?? null}, ${opts.phone ?? null})
  `;
}

/** Throws unless the user has active SMS consent. Call before ANY outbound SMS. */
export async function assertSmsConsent(sql: Sql, userId: string): Promise<void> {
  const state = await getSmsConsent(sql, userId);
  if (!state?.smsConsent) {
    throw new Error("User has not consented to receive SMS.");
  }
}
