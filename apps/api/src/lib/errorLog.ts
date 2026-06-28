import type { Sql } from "@sweepr/db";
import { logger } from "./logger";

export interface ErrorLogInput {
  source?: "server" | "client";
  app?: string | null;
  level?: "error" | "warn" | "fatal";
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  clerkId?: string | null;
  userId?: string | null;
  requestId?: string | null;
  context?: Record<string, unknown>;
}

/** Truncate long strings so a single error can't bloat the table. */
function trunc(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Persist an error to the admin error feed. Best-effort: never throws, so
 * logging an error can't itself break a request.
 */
export async function recordError(sql: Sql, input: ErrorLogInput): Promise<void> {
  try {
    await sql`
      INSERT INTO error_logs (
        source, app, level, message, stack, path, method,
        status_code, clerk_id, user_id, request_id, context
      ) VALUES (
        ${input.source ?? "server"},
        ${input.app ?? null},
        ${input.level ?? "error"},
        ${trunc(input.message, 2000) ?? "Unknown error"},
        ${trunc(input.stack, 8000)},
        ${trunc(input.path, 512)},
        ${input.method ?? null},
        ${input.statusCode ?? null},
        ${trunc(input.clerkId, 128)},
        ${input.userId ?? null},
        ${trunc(input.requestId, 128)},
        ${JSON.stringify(input.context ?? {})}
      )
    `;
  } catch (err) {
    // Swallow — the error feed must never take down the request path.
    logger.error("recordError failed", err);
  }
}
