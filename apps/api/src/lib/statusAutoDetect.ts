/**
 * Automatic incident detection from error_logs patterns.
 *
 * Thresholds (industry-standard SRE):
 *   Fire when: (≥3 distinct users AND ≥20 total occurrences in 30 min)
 *              OR (≥20 occurrences in 10 min from ≥2 users)
 *
 * Severity by % of 24-hour active users affected:
 *   critical  ≥ 50 %
 *   major     ≥ 25 %
 *   moderate  ≥ 10 %
 *   minor      < 10 %
 *
 * Only fires for level = 'error' | 'fatal'. Skips warn/info.
 * Will not open a duplicate for an already-open incident with the same fingerprint.
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Env } from "../types";

// Normalise a message so transient values (UUIDs, numbers, hashes) don't
// create a unique fingerprint for every occurrence.
function fingerprint(app: string | null, message: string): string {
  const normalized = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b\d{5,}\b/g, "<n>")            // long numbers (IDs, timestamps)
    .replace(/https?:\/\/\S+/g, "<url>")       // URLs
    .replace(/at\s+\S+:\d+:\d+/g, "")         // stack-frame positions
    .slice(0, 120)
    .trim();
  return `${app ?? "unknown"}::${normalized}`;
}

function severityFromPct(pct: number): "minor" | "moderate" | "major" | "critical" {
  if (pct >= 50) return "critical";
  if (pct >= 25) return "major";
  if (pct >= 10) return "moderate";
  return "minor";
}

function affectedService(app: string | null): string {
  const map: Record<string, string> = {
    api: "API",
    admin: "Admin Console",
    customer: "Customer App",
    cleaner: "Cleaner App",
    marketing: "Marketing Site",
  };
  return map[app ?? ""] ?? "Platform";
}

interface ErrorPattern {
  app: string | null;
  fingerprint: string;
  distinct_users: number;
  count_30min: number;
  count_10min: number;
}

async function postSlackAlert(
  sql: NeonQueryFunction<false, false>,
  env: Env,
  incidentId: string,
  title: string,
  severity: string,
  affectedUsers: number,
  totalOccurrences: number
): Promise<void> {
  try {
    const workspaceRows = await sql`
      SELECT bot_token FROM slack_workspaces WHERE active = true LIMIT 1
    ` as { bot_token: string }[];
    if (!workspaceRows.length) return;

    const channelRows = await sql`
      SELECT slack_channel_id FROM slack_channels
      WHERE purpose IN ('ops', 'it') AND active = true
      LIMIT 1
    ` as { slack_channel_id: string }[];
    if (!channelRows.length) return;

    const severityEmoji: Record<string, string> = {
      critical: "🔴", major: "🟠", moderate: "🟡", minor: "🔵",
    };
    const emoji = severityEmoji[severity] ?? "⚠️";

    const { postMessage } = await import("./slack");
    await postMessage(workspaceRows[0].bot_token, channelRows[0].slack_channel_id, {
      text: `${emoji} Auto-detected incident: ${title}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${emoji} *Auto-Detected Incident* — ${severity.toUpperCase()}\n*${title}*\n${affectedUsers} users affected · ${totalOccurrences} occurrences`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "View in Admin" },
              url: `https://admin.getsweepr.com/status`,
              action_id: `view_incident_${incidentId}`,
            },
          ],
        },
      ],
    });
  } catch {
    // Non-fatal — Slack alert failure must never block incident creation
  }
}

export async function detectAndCreateIncidents(
  sql: NeonQueryFunction<false, false>,
  env: Env
): Promise<number> {
  let created = 0;

  try {
    // How many distinct users were active (generated any log) in last 24 h
    const activeRows = await sql`
      SELECT COUNT(DISTINCT user_id)::int AS cnt
      FROM error_logs
      WHERE occurred_at > NOW() - INTERVAL '24 hours'
        AND user_id IS NOT NULL
    ` as { cnt: number }[];
    const activeUsers = Math.max(parseInt(String(activeRows[0]?.cnt ?? 0), 10) || 0, 10);

    // Error patterns in last 30 min
    const patterns = await sql`
      SELECT
        app,
        LEFT(
          REGEXP_REPLACE(
            REGEXP_REPLACE(message,
              '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<id>', 'gi'),
            '[0-9]{5,}', '<n>', 'g'),
          120) AS msg_norm,
        COUNT(*)                                                                  AS count_30min,
        COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '10 minutes')      AS count_10min,
        COUNT(DISTINCT user_id)                                                   AS distinct_users
      FROM error_logs
      WHERE occurred_at > NOW() - INTERVAL '30 minutes'
        AND level IN ('error','fatal')
        AND user_id IS NOT NULL
      GROUP BY app, msg_norm
      HAVING
        (COUNT(DISTINCT user_id) >= 3 AND COUNT(*) >= 20)
        OR (COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '10 minutes') >= 20
            AND COUNT(DISTINCT user_id) >= 2)
    ` as { app: string | null; msg_norm: string; count_30min: string; count_10min: string; distinct_users: string }[];

    for (const p of patterns) {
      const fp = fingerprint(p.app, p.msg_norm);
      const distinctUsers = parseInt(p.distinct_users, 10) || 0;
      const count30min = parseInt(p.count_30min, 10) || 0;
      const affectedPct = (distinctUsers / activeUsers) * 100;
      const severity = severityFromPct(affectedPct);
      const service = affectedService(p.app);

      // Check for existing open incident with same fingerprint
      const existing = await sql`
        SELECT id FROM status_incidents
        WHERE error_fingerprint = ${fp}
          AND status != 'resolved'
        LIMIT 1
      ` as { id: string }[];

      if (existing.length > 0) {
        // Update counts on existing incident so admin can see freshness
        await sql`
          UPDATE status_incidents SET
            affected_user_count = ${distinctUsers},
            total_occurrences   = ${count30min},
            updated_at          = NOW()
          WHERE id = ${existing[0].id}
        `;
        continue;
      }

      const title = `Issue detected affecting ${service}`;
      const summary =
        `We've become aware of an issue affecting ${service}. ` +
        `Our team has been automatically alerted and is working to resolve it promptly. ` +
        `We apologize for any inconvenience.`;

      const rows = await sql`
        INSERT INTO status_incidents
          (title, summary, status, severity, affected_features,
           is_prelaunch_update, auto_detected, error_fingerprint,
           affected_user_count, total_occurrences)
        VALUES
          (${title}, ${summary}, 'investigating', ${severity}, ${[service]},
           false, true, ${fp}, ${distinctUsers}, ${count30min})
        RETURNING id
      ` as { id: string }[];

      const incidentId = rows[0].id;

      // Seed the timeline with the auto-detection note
      await sql`
        INSERT INTO status_updates (incident_id, message, status)
        VALUES (
          ${incidentId},
          ${`Incident auto-detected by Sweepr monitoring. ${distinctUsers} user(s) affected · ${count30min} occurrences in the last 30 min.`},
          'investigating'
        )
      `;

      created++;

      await postSlackAlert(sql, env, incidentId, title, severity, distinctUsers, count30min);
    }
  } catch (err) {
    // Non-fatal — don't block the cron handler
    console.error("statusAutoDetect failed", err);
  }

  return created;
}
