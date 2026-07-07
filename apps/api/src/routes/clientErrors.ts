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
 * Client error ingest — receives errors caught by the frontend apps' React
 * error boundaries and global handlers, and writes them to the shared admin
 * error feed. Unauthenticated (errors can happen before/around auth) but
 * rate-limited at the app level. No request bodies or server-side secrets
 * are accepted, only what the browser already knows about itself.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { recordError, makeReferenceId, makeFingerprint } from "../lib/errorLog";
import { redact } from "../lib/logger";
import type { AppBindings } from "../types";

export const clientErrorsRouter = new Hono<AppBindings>();

const breadcrumbSchema = z.object({
  ts: z.string().optional(),
  level: z.enum(["info", "warn", "error"]).optional(),
  msg: z.string().max(2000),
});

const schema = z.object({
  app: z.enum(["admin", "customer", "cleaner", "marketing", "legal", "service", "status"]),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  path: z.string().max(512).optional(),
  level: z.enum(["error", "warn", "fatal"]).optional(),
  componentStack: z.string().max(8000).optional(),
  userAgent: z.string().max(512).optional(),
  url: z.string().max(2048).optional(),
  viewport: z.object({ width: z.number().optional(), height: z.number().optional() }).optional(),
  language: z.string().max(64).optional(),
  online: z.boolean().optional(),
  breadcrumbs: z.array(breadcrumbSchema).max(20).optional(),
});

/** Best-effort: pull the error's class name off the first line of a stack, e.g. "TypeError: x is not a function" -> "TypeError". */
function errorNameFromStack(stack: string | undefined, message: string): string {
  const firstLine = stack?.split("\n", 1)[0]?.trim();
  const match = firstLine?.match(/^([A-Za-z][A-Za-z0-9_.]*Error)\b/);
  if (match) return match[1];
  // Some frameworks report `Name: message` on the first line even without "Error" in the name.
  const colonMatch = firstLine?.match(/^([A-Za-z][A-Za-z0-9_.]*):\s/);
  if (colonMatch && firstLine !== message) return colonMatch[1];
  return "ClientError";
}

clientErrorsRouter.post("/", zValidator("json", schema), async (c) => {
  const body = c.req.valid("json");
  const errorName = errorNameFromStack(body.stack, body.message);
  const reference = makeReferenceId();
  const fingerprint = await makeFingerprint(errorName, body.message, "CLIENT", body.path ?? body.url ?? "");

  await recordError(getDb(c.env.DATABASE_URL), {
    source: "client",
    app: body.app,
    level: body.level ?? "error",
    message: body.message,
    stack: body.stack ?? null,
    path: body.path ?? null,
    fingerprint,
    referenceId: reference,
    errorName,
    context: {
      v: 2,
      err: { name: errorName, message: body.message, stack: body.stack ?? null },
      pg: null,
      request: {
        path: body.path ?? null,
        method: null,
        query: null,
        headers: null,
        bodySnippet: null,
        ip: c.req.header("cf-connecting-ip") ?? null,
        cfRay: c.req.header("cf-ray") ?? null,
        colo: null,
        country: null,
        userAgent: body.userAgent ?? c.req.header("user-agent") ?? null,
        client: {
          url: body.url ?? null,
          componentStack: body.componentStack ?? null,
          appVersion: null,
          viewport: body.viewport ?? null,
          language: body.language ?? null,
          online: body.online ?? null,
        },
      },
      user: null,
      runtime: { environment: c.env.ENVIRONMENT, worker: body.app },
      timing: null,
      breadcrumbs: redact(body.breadcrumbs ?? []),
      logData: null,
    },
  }, c.env);

  return c.json({ received: true, reference });
});
