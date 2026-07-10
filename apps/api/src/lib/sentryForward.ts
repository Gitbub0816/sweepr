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
 * Server-side Sentry forwarder.
 *
 * Every error on the platform — server-side logger flushes AND client errors
 * from all six apps (they already POST to /client-errors) — funnels through
 * lib/errorLog.recordError. Forwarding to Sentry from that one choke point
 * gives Sentry full coverage with ZERO frontend SDK weight and exactly one
 * secret: SENTRY_DSN (`printf 'https://…' | wrangler secret put SENTRY_DSN`).
 *
 * Uses Sentry's plain store API (no SDK — Workers-friendly). The DSN's public
 * key is safe to treat as config; it can only ingest events, not read them.
 * Best-effort by design: Sentry being down must never break error logging.
 */

import type { Env } from "../types";
import type { ErrorLogInput } from "./errorLog";

interface ParsedDsn {
  key: string;
  host: string;
  projectId: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  // https://<public_key>@<host>/<project_id>
  const m = dsn.match(/^https:\/\/([^:@]+)(?::[^@]*)?@([^/]+)\/(\d+)\s*$/);
  if (!m) return null;
  return { key: m[1], host: m[2], projectId: m[3] };
}

/** RFC-4122-ish 32-hex event id (Sentry requires exactly 32 hex chars). */
function eventId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function forwardToSentry(env: Env, input: ErrorLogInput): Promise<void> {
  const dsn = env.SENTRY_DSN;
  if (!dsn) return;
  const parsed = parseDsn(dsn.trim());
  if (!parsed) return;

  try {
    const level = input.level === "warn" ? "warning" : (input.level ?? "error");
    const event = {
      event_id: eventId(),
      timestamp: Date.now() / 1000,
      platform: "javascript",
      level,
      logger: input.app ?? input.source ?? "api",
      environment: "production",
      // Reuse our fingerprint so Sentry groups match the admin error feed.
      fingerprint: input.fingerprint ? [input.fingerprint] : undefined,
      exception: {
        values: [
          {
            type: input.errorName ?? "Error",
            value: input.message?.slice(0, 1000) ?? "unknown",
          },
        ],
      },
      tags: {
        app: input.app ?? "api",
        source: input.source ?? "server",
        ...(input.errorCode ? { code: input.errorCode } : {}),
        ...(input.statusCode ? { status: String(input.statusCode) } : {}),
      },
      request: input.path
        ? { url: `https://api.getsweepr.com${input.path}`, method: input.method ?? undefined }
        : undefined,
      extra: {
        stack: input.stack?.slice(0, 8000) ?? undefined,
        referenceId: input.referenceId ?? undefined,
        requestId: input.requestId ?? undefined,
        context: input.context ?? undefined,
      },
    };

    await fetch(`https://${parsed.host}/api/${parsed.projectId}/store/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=sweepr-api/1.0, sentry_key=${parsed.key}`,
      },
      body: JSON.stringify(event),
    });
  } catch {
    /* best-effort — never let Sentry break error logging */
  }
}
