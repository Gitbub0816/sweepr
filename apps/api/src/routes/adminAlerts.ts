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
 * Admin alerting — per-admin preferences, the notification feed behind the
 * bell, unread badge counts, and a self-test endpoint.
 *
 *   GET  /admin/alerts/prefs                   caller's prefs grid + SMS phone
 *   PUT  /admin/alerts/prefs                   replace caller's prefs (+phone)
 *   GET  /admin/alerts/notifications           caller's feed (?unread=1&limit=)
 *   POST /admin/alerts/notifications/:id/read  mark one read
 *   POST /admin/alerts/notifications/read-all  mark all read
 *   GET  /admin/alerts/badges                  unread counts by category + nav map
 *   POST /admin/alerts/test                    test alert to the caller only
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import { requireAdminRole } from "../middleware/adminRoles";
import {
  ALERT_CATEGORIES,
  ALERT_CHANNELS,
  CATEGORY_NAV_PATHS,
  defaultChannelEnabled,
  effectiveChannels,
  type AlertChannel,
  type AlertPrefRow,
} from "../lib/adminAlerts";
import { sendEmail, SENDERS, wrapBodyInTemplate } from "../lib/mailer";
import { sendSms, toE164 } from "../lib/sms";
import { grantSmsConsent } from "../lib/smsConsent";
import type { AppBindings } from "../types";

export const adminAlertsRouter = new Hono<AppBindings>();

adminAlertsRouter.use(
  "*",
  requireAuth,
  requireAdminRole("super_admin", "admin", "ops", "finance", "support", "trainer", "it", "security"),
);

interface CallerUser {
  id: string;
  email: string | null;
}

/** Resolve the signed-in admin's users row (needed for user_id-keyed tables). */
async function callerUser(sql: ReturnType<typeof getDb>, clerkId: string): Promise<CallerUser | null> {
  const user = await getUserByClerkId(sql, clerkId);
  return user ? { id: user.id, email: user.email ?? null } : null;
}

adminAlertsRouter.get("/prefs", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await callerUser(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "No user record for this account." }, 400);

  const rows = (await sql`
    SELECT category, channel, enabled FROM admin_alert_prefs WHERE user_id = ${user.id}
  `) as AlertPrefRow[];
  const contact = (await sql`
    SELECT sms_phone FROM admin_alert_contacts WHERE user_id = ${user.id} LIMIT 1
  `) as Array<{ sms_phone: string | null }>;

  const prefs = ALERT_CATEGORIES.flatMap((category) =>
    ALERT_CHANNELS.map((channel) => {
      const row = rows.find((r) => r.category === category && r.channel === channel);
      return {
        category,
        channel,
        enabled: row ? row.enabled : defaultChannelEnabled(category, channel),
      };
    }),
  );

  return c.json({
    categories: ALERT_CATEGORIES,
    channels: ALERT_CHANNELS,
    prefs,
    smsPhone: contact[0]?.sms_phone ?? null,
  });
});

const prefsSchema = z.object({
  prefs: z
    .array(
      z.object({
        category: z.enum(ALERT_CATEGORIES),
        channel: z.enum(ALERT_CHANNELS),
        enabled: z.boolean(),
      }),
    )
    .max(ALERT_CATEGORIES.length * ALERT_CHANNELS.length),
  smsPhone: z.string().max(32).nullable().optional(),
});

adminAlertsRouter.put("/prefs", zValidator("json", prefsSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await callerUser(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "No user record for this account." }, 400);

  const { prefs, smsPhone } = c.req.valid("json");

  let normalizedPhone: string | null | undefined = smsPhone;
  if (typeof smsPhone === "string" && smsPhone.trim() !== "") {
    normalizedPhone = toE164(smsPhone);
    if (!normalizedPhone) {
      return c.json({ error: "SMS phone must be a valid E.164 number, e.g. +15551234567." }, 400);
    }
  } else if (smsPhone === "") {
    normalizedPhone = null;
  }

  await sql`DELETE FROM admin_alert_prefs WHERE user_id = ${user.id}`;
  for (const p of prefs) {
    await sql`
      INSERT INTO admin_alert_prefs (user_id, category, channel, enabled, updated_at)
      VALUES (${user.id}, ${p.category}, ${p.channel}, ${p.enabled}, NOW())
      ON CONFLICT (user_id, category, channel)
      DO UPDATE SET enabled = ${p.enabled}, updated_at = NOW()
    `;
  }

  if (normalizedPhone !== undefined) {
    if (normalizedPhone === null) {
      await sql`DELETE FROM admin_alert_contacts WHERE user_id = ${user.id}`;
    } else {
      const existing = (await sql`
        SELECT sms_phone FROM admin_alert_contacts WHERE user_id = ${user.id} LIMIT 1
      `) as Array<{ sms_phone: string | null }>;
      await sql`
        INSERT INTO admin_alert_contacts (user_id, sms_phone, updated_at)
        VALUES (${user.id}, ${normalizedPhone}, NOW())
        ON CONFLICT (user_id) DO UPDATE SET sms_phone = ${normalizedPhone}, updated_at = NOW()
      `;
      // Entering a number to receive alert texts is an explicit opt-in —
      // record it so the consent-checked SMS path can deliver.
      if (existing[0]?.sms_phone !== normalizedPhone) {
        try {
          await grantSmsConsent(sql, user.id, {
            source: "admin",
            ip: c.req.header("CF-Connecting-IP") ?? null,
            userAgent: c.req.header("User-Agent") ?? null,
            phone: normalizedPhone,
          });
        } catch (err) {
          logger.error("adminAlerts.consent_failed", err, { userId: user.id });
        }
      }
    }
  }

  return c.json({ ok: true });
});

adminAlertsRouter.get("/notifications", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await callerUser(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "No user record for this account." }, 400);

  const unread = c.req.query("unread") === "1";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);

  const rows = unread
    ? await sql`
        SELECT id, category, title, body, link_path, created_at, read_at
        FROM admin_notifications
        WHERE user_id = ${user.id} AND read_at IS NULL
        ORDER BY created_at DESC LIMIT ${limit}
      `
    : await sql`
        SELECT id, category, title, body, link_path, created_at, read_at
        FROM admin_notifications
        WHERE user_id = ${user.id}
        ORDER BY created_at DESC LIMIT ${limit}
      `;

  return c.json({ notifications: rows });
});

adminAlertsRouter.post("/notifications/read-all", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await callerUser(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "No user record for this account." }, 400);

  const rows = (await sql`
    UPDATE admin_notifications SET read_at = NOW()
    WHERE user_id = ${user.id} AND read_at IS NULL RETURNING id
  `) as Array<{ id: string }>;
  return c.json({ ok: true, count: rows.length });
});

adminAlertsRouter.post("/notifications/:id/read", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await callerUser(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "No user record for this account." }, 400);

  const id = c.req.param("id");
  await sql`
    UPDATE admin_notifications SET read_at = NOW()
    WHERE id = ${id} AND user_id = ${user.id} AND read_at IS NULL
  `;
  return c.json({ ok: true });
});

adminAlertsRouter.get("/badges", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await callerUser(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "No user record for this account." }, 400);

  const rows = (await sql`
    SELECT category, COUNT(*)::int AS count
    FROM admin_notifications
    WHERE user_id = ${user.id} AND read_at IS NULL
    GROUP BY category
  `) as Array<{ category: string; count: number }>;

  const counts: Record<string, number> = {};
  for (const cat of ALERT_CATEGORIES) counts[cat] = 0;
  let total = 0;
  for (const row of rows) {
    if (row.category in counts) counts[row.category] = row.count;
    total += row.count;
  }

  return c.json({ counts, total, navPaths: CATEGORY_NAV_PATHS });
});

adminAlertsRouter.post("/test", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await callerUser(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "No user record for this account." }, 400);

  const rows = (await sql`
    SELECT category, channel, enabled FROM admin_alert_prefs WHERE user_id = ${user.id}
  `) as AlertPrefRow[];

  // A channel is exercised if it's enabled for ANY category.
  const enabledChannels = ALERT_CHANNELS.filter((channel) =>
    ALERT_CATEGORIES.some((category) =>
      effectiveChannels(category, rows.filter((r) => r.category === category)).includes(channel),
    ),
  );

  const results: Record<AlertChannel, string> = { inapp: "skipped", email: "skipped", sms: "skipped" };

  if (enabledChannels.includes("inapp")) {
    try {
      await sql`
        INSERT INTO admin_notifications (user_id, category, title, body, link_path)
        VALUES (${user.id}, 'test', 'Test alert',
                'This is a test of your Sweepr admin alert settings.', NULL)
      `;
      results.inapp = "sent";
    } catch (err) {
      logger.error("adminAlerts.test_inapp_failed", err, { userId: user.id });
      results.inapp = "failed";
    }
  }

  if (enabledChannels.includes("email")) {
    if (c.env.MAILERSEND_API_KEY && user.email) {
      try {
        const subject = "[Sweepr test] Test alert";
        await sendEmail(c.env.MAILERSEND_API_KEY, {
          to: user.email,
          subject,
          from: SENDERS.ALERTS,
          html: wrapBodyInTemplate(subject, "This is a test of your Sweepr admin alert settings. If you're reading this, email alerts are working."),
          relatedType: "admin_alert_test",
          recordOutbound: false,
        });
        results.email = "sent";
      } catch (err) {
        logger.error("adminAlerts.test_email_failed", err, { userId: user.id });
        results.email = "failed";
      }
    } else {
      results.email = user.email ? "skipped: email not configured" : "skipped: no email on account";
    }
  }

  if (enabledChannels.includes("sms")) {
    const contact = (await sql`
      SELECT sms_phone FROM admin_alert_contacts WHERE user_id = ${user.id} LIMIT 1
    `) as Array<{ sms_phone: string | null }>;
    const phone = contact[0]?.sms_phone ?? null;
    if (c.env.MAILERSEND_SMS_FROM && phone) {
      try {
        await sendSms(c.env, sql, {
          userId: user.id,
          to: phone,
          type: "admin_alert",
          body: "Sweepr test: your admin SMS alerts are working.",
        });
        results.sms = "sent";
      } catch (err) {
        logger.error("adminAlerts.test_sms_failed", err, { userId: user.id });
        results.sms = "failed";
      }
    } else {
      results.sms = phone ? "skipped: SMS sending not configured" : "skipped: no SMS phone saved";
    }
  }

  return c.json({ ok: true, channels: results });
});
