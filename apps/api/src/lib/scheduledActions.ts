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
 * Scheduled-event automations for the admin calendar.
 *
 * An event with kind='automation' names one action from the catalog below plus
 * a JSON payload; the cron (and the "Run now" admin button) executes it via
 * executeScheduledAction. Each action returns a short human-readable result
 * note that is stored on the event.
 */

import { sendBulkEmail, wrapBodyInTemplate } from "./mailer";
import { alertAdmins } from "./adminAlerts";
import { logger } from "./logger";
import type { Sql } from "./db";
import type { Env } from "../types";

export interface ScheduledEventRow {
  id: string;
  title: string;
  action_type: string | null;
  action_payload: Record<string, unknown>;
  starts_at: string;
}

/** Catalog served to the admin UI so the create-event modal can render fields. */
export const SCHEDULED_ACTION_CATALOG = [
  {
    type: "broadcast_email",
    label: "Send broadcast / newsletter",
    description: "Email an audience (newsletter, waitlists, city subscribers, or everyone) with the branded template.",
    fields: [
      { key: "audience", label: "Audience", kind: "select", options: ["newsletter", "waitlist_customer", "waitlist_cleaner", "city", "all"], required: true },
      { key: "areaSlug", label: "Area slug (city audience only)", kind: "text", required: false },
      { key: "subject", label: "Subject", kind: "text", required: true },
      { key: "body", label: "Body (plain text; blank line = new paragraph)", kind: "textarea", required: true },
    ],
  },
  {
    type: "status_announcement",
    label: "Post status-page announcement",
    description: "Publish an update/announcement to the public status page (launches, maintenance, notices).",
    fields: [
      { key: "title", label: "Title", kind: "text", required: true },
      { key: "summary", label: "Summary", kind: "textarea", required: true },
      { key: "severity", label: "Severity", kind: "select", options: ["minor", "moderate", "major", "critical"], required: false },
      { key: "isPrelaunchUpdate", label: "Show as prelaunch update", kind: "select", options: ["true", "false"], required: false },
    ],
  },
  {
    type: "service_area_launch",
    label: "Launch service area",
    description: "Flip an existing service area (by slug) to active at the scheduled time.",
    fields: [{ key: "slug", label: "Service area slug", kind: "text", required: true }],
  },
  {
    type: "prelaunch_toggle",
    label: "Toggle prelaunch gate",
    description: "Turn a prelaunch gate on/off, e.g. open the customer app at launch time.",
    fields: [
      { key: "key", label: "Gate", kind: "select", options: ["prelaunch_customer", "prelaunch_cleaner", "prelaunch_pricing"], required: true },
      { key: "value", label: "Value", kind: "select", options: ["on", "off"], required: true },
    ],
  },
  {
    type: "admin_alert",
    label: "Alert the admin team",
    description: "Fan out an internal reminder/announcement to admins via their alert preferences (in-app/email/SMS).",
    fields: [
      { key: "title", label: "Title", kind: "text", required: true },
      { key: "body", label: "Body", kind: "textarea", required: false },
    ],
  },
] as const;

export type ScheduledActionType = (typeof SCHEDULED_ACTION_CATALOG)[number]["type"];

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

async function runBroadcast(sql: Sql, env: Env, p: Record<string, unknown>): Promise<string> {
  const audience = str(p.audience);
  const subject = str(p.subject);
  const body = str(p.body);
  const areaSlug = str(p.areaSlug) || null;
  if (!audience || !subject || !body) throw new Error("broadcast_email requires audience, subject, body");
  if (!env.MAILERSEND_API_KEY) throw new Error("MAILERSEND_API_KEY not configured");

  const emails = new Set<string>();
  const add = (rows: Array<{ email: string }>) => rows.forEach((r) => emails.add(r.email.toLowerCase()));
  if (audience === "newsletter" || audience === "all")
    add((await sql`SELECT email FROM newsletter_subscribers`) as Array<{ email: string }>);
  if (audience === "waitlist_customer" || audience === "all")
    add((await sql`SELECT email FROM waitlist WHERE type = 'customer'`) as Array<{ email: string }>);
  if (audience === "waitlist_cleaner" || audience === "all")
    add((await sql`SELECT email FROM waitlist WHERE type = 'cleaner'`) as Array<{ email: string }>);
  if (audience === "city" || audience === "all") {
    add(
      (areaSlug
        ? await sql`SELECT email FROM city_subscribers WHERE area_slug = ${areaSlug}`
        : await sql`SELECT email FROM city_subscribers`) as Array<{ email: string }>,
    );
  }

  const list = [...emails];
  if (list.length === 0) return "No recipients for audience, nothing sent.";
  const html = wrapBodyInTemplate(subject, body, undefined, { unsubscribe: true });
  const sent = await sendBulkEmail(env.MAILERSEND_API_KEY, list.map((e) => ({ email: e })), subject, html, sql);
  await sql`
    INSERT INTO broadcast_sends (audience, broadcast_type, area_slug, subject, html, sent_count, sent_by)
    VALUES (${audience}, 'scheduled', ${areaSlug}, ${subject}, ${html}, ${sent}, 'system:schedule')
  `;
  return `Broadcast sent to ${sent} of ${list.length} recipients (${audience}).`;
}

async function runStatusAnnouncement(sql: Sql, p: Record<string, unknown>): Promise<string> {
  const title = str(p.title);
  const summary = str(p.summary);
  if (!title || !summary) throw new Error("status_announcement requires title and summary");
  const severity = ["minor", "moderate", "major", "critical"].includes(str(p.severity)) ? str(p.severity) : "minor";
  const isPrelaunch = str(p.isPrelaunchUpdate) !== "false";
  const rows = (await sql`
    INSERT INTO status_incidents (title, summary, status, severity, affected_features, is_prelaunch_update)
    VALUES (${title}, ${summary}, 'monitoring', ${severity}, ${[] as string[]}, ${isPrelaunch})
    RETURNING id
  `) as Array<{ id: string }>;
  return `Status announcement published (incident ${rows[0]?.id ?? "?"}).`;
}

async function runServiceAreaLaunch(sql: Sql, p: Record<string, unknown>): Promise<string> {
  const slug = str(p.slug);
  if (!slug) throw new Error("service_area_launch requires slug");
  const rows = (await sql`
    UPDATE service_areas SET status = 'active' WHERE slug = ${slug} RETURNING name
  `) as Array<{ name: string }>;
  if (rows.length === 0) throw new Error(`No service area with slug "${slug}"`);
  return `Service area "${rows[0].name}" (${slug}) is now active.`;
}

async function runPrelaunchToggle(sql: Sql, p: Record<string, unknown>): Promise<string> {
  const key = str(p.key);
  if (!["prelaunch_customer", "prelaunch_cleaner", "prelaunch_pricing"].includes(key)) {
    throw new Error("prelaunch_toggle requires key ∈ prelaunch_customer|prelaunch_cleaner|prelaunch_pricing");
  }
  const value = str(p.value) === "on" ? "true" : "false";
  await sql`
    INSERT INTO site_settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return `${key} set to ${value === "true" ? "ON (gated)" : "OFF (open)"}.`;
}

async function runAdminAlert(sql: Sql, env: Env, p: Record<string, unknown>): Promise<string> {
  const title = str(p.title);
  if (!title) throw new Error("admin_alert requires title");
  await alertAdmins(sql, env, {
    category: "it",
    title: `Scheduled: ${title}`,
    body: str(p.body) || null,
    linkPath: "/schedule",
  });
  return "Admin alert fanned out.";
}

/** Execute one automation; returns the result note. Throws on failure. */
export async function executeScheduledAction(sql: Sql, env: Env, ev: ScheduledEventRow): Promise<string> {
  const payload = (ev.action_payload ?? {}) as Record<string, unknown>;
  switch (ev.action_type) {
    case "broadcast_email":
      return runBroadcast(sql, env, payload);
    case "status_announcement":
      return runStatusAnnouncement(sql, payload);
    case "service_area_launch":
      return runServiceAreaLaunch(sql, payload);
    case "prelaunch_toggle":
      return runPrelaunchToggle(sql, payload);
    case "admin_alert":
      return runAdminAlert(sql, env, payload);
    default:
      throw new Error(`Unknown action_type "${ev.action_type}"`);
  }
}

/**
 * Automations older than this past their scheduled time are marked failed
 * instead of firing late — a launch email 2 days late is worse than none.
 */
const MISFIRE_WINDOW_MS = 6 * 60 * 60 * 1000;

/** Cron entry point: run everything due. Idempotent via status transitions. */
export async function executeDueScheduledEvents(sql: Sql, env: Env): Promise<number> {
  const due = (await sql`
    SELECT id, title, action_type, action_payload, starts_at
    FROM scheduled_events
    WHERE status = 'scheduled' AND kind = 'automation' AND starts_at <= NOW()
    ORDER BY starts_at ASC
    LIMIT 10
  `) as unknown as ScheduledEventRow[];

  let ran = 0;
  for (const ev of due) {
    // Claim first so a concurrent cron fire can't double-execute.
    const claimed = (await sql`
      UPDATE scheduled_events SET status = 'executed', executed_at = NOW(), updated_at = NOW()
      WHERE id = ${ev.id} AND status = 'scheduled'
      RETURNING id
    `) as Array<{ id: string }>;
    if (claimed.length === 0) continue;

    const ageMs = Date.now() - new Date(ev.starts_at).getTime();
    if (ageMs > MISFIRE_WINDOW_MS) {
      await sql`
        UPDATE scheduled_events
        SET status = 'failed', result_note = 'Missed execution window (cron was down past the 6h misfire limit); not run.'
        WHERE id = ${ev.id}
      `;
      logger.warn("schedule.misfire_skipped", { id: ev.id, title: ev.title });
      continue;
    }

    try {
      const note = await executeScheduledAction(sql, env, ev);
      await sql`UPDATE scheduled_events SET result_note = ${note} WHERE id = ${ev.id}`;
      logger.info("schedule.executed", { id: ev.id, action: ev.action_type });
      ran++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await sql`
        UPDATE scheduled_events SET status = 'failed', result_note = ${msg.slice(0, 500)} WHERE id = ${ev.id}
      `;
      logger.error("schedule.action_failed", err, { id: ev.id, action: ev.action_type });
    }
  }
  return ran;
}
