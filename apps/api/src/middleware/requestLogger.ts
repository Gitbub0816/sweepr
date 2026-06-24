import { createMiddleware } from "hono/factory";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";

/**
 * Logs every API request to api_request_logs.
 * Non-fatal — a logging failure never breaks the request.
 */
export function requestLogger() {
  return createMiddleware<AppBindings>(async (c, next) => {
    const start = Date.now();
    // Generate or propagate a request ID for end-to-end tracing.
    const requestId = c.req.header("X-Request-ID") ?? crypto.randomUUID();
    c.res.headers.set("X-Request-ID", requestId);

    let statusCode = 200;
    let errorMessage: string | null = null;

    try {
      await next();
      statusCode = c.res.status;
      // Re-set after next() in case response was replaced.
      c.res.headers.set("X-Request-ID", requestId);
    } catch (err) {
      statusCode = 500;
      errorMessage = err instanceof Error ? err.message : "Unknown error";
      throw err;
    } finally {
      const durationMs = Date.now() - start;
      // Skip health/root to avoid log spam
      const path = new URL(c.req.url).pathname;
      if (path === "/health" || path === "/") return;

      try {
        const sql = getDb(c.env.DATABASE_URL);
        await sql`
          INSERT INTO api_request_logs (
            method, path, status_code, duration_ms,
            request_id, error_message, cf_ray, country_code, logged_at
          ) VALUES (
            ${c.req.method},
            ${path},
            ${statusCode},
            ${durationMs},
            ${requestId},
            ${errorMessage},
            ${c.req.header("CF-Ray") ?? null},
            ${c.req.header("CF-IPCountry") ?? null},
            NOW()
          )
        `;
      } catch (logErr) {
        logger.error("requestLogger write failed", logErr);
      }
    }
  });
}
