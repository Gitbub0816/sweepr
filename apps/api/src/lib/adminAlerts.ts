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
 * Admin alert fan-out — one entry point (`alertAdmins`) that delivers an
 * operational alert to every admin through the channels each admin has
 * enabled (in-app feed, email, SMS), per their admin_alert_prefs.
 *
 * Defaults when an admin has no explicit pref row for a category+channel:
 * in-app on for every category, email on for 'errors' and 'security' only,
 * SMS off. The defaulting logic is a pure function (`effectiveChannels`) so
 * it's unit-testable without a DB.
 *
 * Everything here is best-effort: `alertAdmins` never throws, so call sites
 * can fire-and-forget (via `c.executionCtx.waitUntil` where a Hono Context is
 * available — see `alertAdminsFromContext`).
 */
import type { Context } from "hono";
import { getDb, type Sql } from "./db";
import { logger } from "./logger";
import { sendEmail, SENDERS, wrapBodyInTemplate } from "./mailer";
import { sendSms } from "./sms";
import type { AppBindings, Env } from "../types";

export const ALERT_CATEGORIES = [
  "errors",
  "security",
  "it",
  "mail",
  "approvals",
  "disputes",
  "applications",
] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

export const ALERT_CHANNELS = ["inapp", "email", "sms"] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

/** Categories whose email channel defaults to ON (everything else defaults off). */
export const DEFAULT_EMAIL_CATEGORIES: readonly AlertCategory[] = ["errors", "security"];

/** Sidebar route each category's unread count badges (mirrored by the admin UI). */
export const CATEGORY_NAV_PATHS: Record<AlertCategory, string> = {
  errors: "/errors",
  security: "/security",
  it: "/it-portal",
  mail: "/mail",
  approvals: "/approvals",
  disputes: "/disputes",
  applications: "/applications",
};

export interface AlertPrefRow {
  category: string;
  channel: string;
  enabled: boolean;
}

/** Default on/off state for a category+channel when no pref row exists. */
export function defaultChannelEnabled(category: AlertCategory, channel: AlertChannel): boolean {
  if (channel === "inapp") return true;
  if (channel === "email") return DEFAULT_EMAIL_CATEGORIES.includes(category);
  return false;
}

/**
 * The channels that fire for `category` given an admin's pref rows: an
 * explicit row wins; any missing category+channel combination falls back to
 * the defaults above. Pure so it's unit-testable.
 */
export function effectiveChannels(category: AlertCategory, prefs: AlertPrefRow[]): AlertChannel[] {
  return ALERT_CHANNELS.filter((channel) => {
    const row = prefs.find((p) => p.category === category && p.channel === channel);
    return row ? row.enabled : defaultChannelEnabled(category, channel);
  });
}

export interface AdminAlertInput {
  category: AlertCategory;
  title: string;
  body?: string | null;
  linkPath?: string | null;
  /**
   * When set, the alert is skipped entirely if a notification with the same
   * category+title was already created in the last 30 minutes — so repeated
   * occurrences of the same condition don't spam every channel.
   */
  dedupeKey?: string | null;
}

interface AdminRow {
  id: string;
  email: string | null;
}

/**
 * Deliver an alert to every admin through their enabled channels. Never
 * throws — failures are logged and swallowed so call sites can fire-and-forget.
 */
export async function alertAdmins(sql: Sql, env: Env, input: AdminAlertInput): Promise<void> {
  try {
    if (input.dedupeKey) {
      const dup = (await sql`
        SELECT 1 AS hit FROM admin_notifications
        WHERE category = ${input.category} AND title = ${input.title}
          AND created_at > NOW() - INTERVAL '30 minutes'
        LIMIT 1
      `) as Array<{ hit: number }>;
      if (dup[0]) return;
    }

    const admins = (await sql`
      SELECT id, email FROM users WHERE role IN ('admin', 'super_admin')
    `) as AdminRow[];
    if (admins.length === 0) return;

    const prefRows = (await sql`
      SELECT user_id, category, channel, enabled FROM admin_alert_prefs
      WHERE category = ${input.category}
    `) as Array<AlertPrefRow & { user_id: string }>;

    const contacts = (await sql`
      SELECT user_id, sms_phone FROM admin_alert_contacts WHERE sms_phone IS NOT NULL
    `) as Array<{ user_id: string; sms_phone: string }>;

    for (const admin of admins) {
      const channels = effectiveChannels(
        input.category,
        prefRows.filter((p) => p.user_id === admin.id),
      );

      if (channels.includes("inapp")) {
        try {
          await sql`
            INSERT INTO admin_notifications (user_id, category, title, body, link_path)
            VALUES (${admin.id}, ${input.category}, ${input.title},
                    ${input.body ?? null}, ${input.linkPath ?? null})
          `;
        } catch (err) {
          logger.error("adminAlerts.inapp_failed", err, { userId: admin.id, category: input.category });
        }
      }

      if (channels.includes("email") && env.MAILERSEND_API_KEY && admin.email) {
        try {
          const subject = `[Sweepr ${input.category}] ${input.title}`;
          await sendEmail(env.MAILERSEND_API_KEY, {
            to: admin.email,
            subject,
            from: SENDERS.ALERTS,
            html: wrapBodyInTemplate(subject, input.body || input.title),
            relatedType: "admin_alert",
            recordOutbound: false,
          });
        } catch (err) {
          logger.error("adminAlerts.email_failed", err, { userId: admin.id, category: input.category });
        }
      }

      if (channels.includes("sms") && env.MAILERSEND_SMS_FROM) {
        const phone = contacts.find((ct) => ct.user_id === admin.id)?.sms_phone;
        if (phone) {
          try {
            await sendSms(env, sql, {
              userId: admin.id,
              to: phone,
              type: "admin_alert",
              body: `Sweepr ${input.category}: ${input.title}`.slice(0, 160),
            });
          } catch (err) {
            logger.error("adminAlerts.sms_failed", err, { userId: admin.id, category: input.category });
          }
        }
      }
    }
  } catch (err) {
    logger.error("adminAlerts.alertAdmins failed", err, { category: input.category, title: input.title });
  }
}

/**
 * Fire-and-forget wrapper for route handlers: schedules `alertAdmins` on
 * `c.executionCtx.waitUntil` when available (so the fan-out never adds
 * latency to the response) and falls back to an unawaited call otherwise —
 * same pattern as securityEvents.captureFromContext.
 */
export function alertAdminsFromContext(c: Context<AppBindings>, input: AdminAlertInput): void {
  try {
    const sql = getDb(c.env.DATABASE_URL);
    const task = alertAdmins(sql, c.env, input);
    let scheduled = false;
    try {
      c.executionCtx.waitUntil(task);
      scheduled = true;
    } catch {
      /* no executionCtx available — fall through to fire-and-forget */
    }
    if (!scheduled) {
      void task;
    }
  } catch (err) {
    logger.error("adminAlerts.capture_failed", err, { category: input.category });
  }
}
