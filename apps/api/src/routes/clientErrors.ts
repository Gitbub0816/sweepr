/**
 * Client error ingest — receives errors caught by the frontend apps' React
 * error boundaries and global handlers, and writes them to the shared admin
 * error feed. Unauthenticated (errors can happen before/around auth) but
 * rate-limited at the app level. No PII or request bodies are accepted.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { recordError } from "../lib/errorLog";
import type { AppBindings } from "../types";

export const clientErrorsRouter = new Hono<AppBindings>();

const schema = z.object({
  app: z.enum(["admin", "customer", "cleaner", "marketing", "service"]),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  path: z.string().max(512).optional(),
  level: z.enum(["error", "warn", "fatal"]).optional(),
  context: z.record(z.unknown()).optional(),
});

clientErrorsRouter.post("/", zValidator("json", schema), async (c) => {
  const body = c.req.valid("json");
  await recordError(getDb(c.env.DATABASE_URL), {
    source: "client",
    app: body.app,
    level: body.level ?? "error",
    message: body.message,
    stack: body.stack ?? null,
    path: body.path ?? null,
    context: body.context ?? {},
  });
  return c.json({ received: true });
});
