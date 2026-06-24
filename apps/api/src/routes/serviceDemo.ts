/**
 * Day-of-service demo/test routes — only active when SEED_BOOL=true.
 *
 * Provides a stateful sandbox session that simulates the full day-of-service
 * flow without requiring real bookings, auth tokens, or GPS.
 *
 * Routes (all unauthenticated):
 *   POST /service/seed          → create a fresh session; returns { txId }
 *   GET  /service/t/:txId       → get current session state
 *   POST /service/t/:txId/action → body: { action } → advance state machine
 *
 * Actions (cleaner-side):
 *   start_route        confirmed → en_route
 *   simulate_arrival   en_route  → arrived
 *   start_clean        arrived   → in_progress  (reveals access code)
 *   add_photo          in_progress → in_progress (increments photo_count)
 *   finish_clean       in_progress → awaiting_checkout
 *   checkout           awaiting_checkout → completed
 *   reset              any → confirmed
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import type { AppBindings } from "../types";

export const serviceDemoRouter = new Hono<AppBindings>();

// Static seed personas — no real users involved.
const SEED_CLEANER = { name: "Jordan Smith", rating: 4.9, jobs: 142 };
const SEED_CUSTOMER = { name: "Alex Rivera", address: "123 Maple St, Austin, TX 78701" };
const SEED_JOB = {
  service_type: "Standard Clean",
  scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  price: 12900, // cents
  access_code: { type: "keypad", value: "4821", notes: "Side gate to the left" },
};

type DayStatus =
  | "confirmed"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "awaiting_checkout"
  | "completed";

function isSeedEnabled(env: AppBindings["Bindings"]): boolean {
  return env.SEED_BOOL === "true";
}

/** Guard — returns 404 if SEED_BOOL is not true. */
serviceDemoRouter.use("*", async (c, next) => {
  if (!isSeedEnabled(c.env)) {
    return c.json({ error: "Not found" }, 404);
  }
  await next();
});

/** Create a fresh demo session. */
serviceDemoRouter.post("/seed", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    INSERT INTO dos_test_sessions DEFAULT VALUES
    RETURNING id
  `) as Array<{ id: string }>;
  return c.json({ txId: rows[0].id, cleaner: SEED_CLEANER, customer: SEED_CUSTOMER, job: SEED_JOB });
});

interface SessionRow {
  id: string;
  day_status: DayStatus;
  photo_count: number;
  created_at: string;
  updated_at: string;
}

/** Get current state of a session. */
serviceDemoRouter.get("/t/:txId", async (c) => {
  const txId = c.req.param("txId");
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT id, day_status, photo_count, created_at, updated_at
    FROM dos_test_sessions WHERE id = ${txId}
  `) as SessionRow[];

  if (!rows[0]) return c.json({ error: "Session not found" }, 404);
  const s = rows[0];

  return c.json({
    txId: s.id,
    dayStatus: s.day_status,
    photoCount: s.photo_count,
    accessCodeRevealed: ["in_progress", "awaiting_checkout", "completed"].includes(s.day_status),
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    cleaner: SEED_CLEANER,
    customer: SEED_CUSTOMER,
    job: { ...SEED_JOB, scheduled_at: s.created_at },
  });
});

const VALID_ACTIONS = [
  "start_route",
  "simulate_arrival",
  "start_clean",
  "add_photo",
  "finish_clean",
  "checkout",
  "reset",
] as const;

const TRANSITIONS: Record<string, { from: DayStatus | null; to: DayStatus }> = {
  start_route:       { from: "confirmed",         to: "en_route" },
  simulate_arrival:  { from: "en_route",           to: "arrived" },
  start_clean:       { from: "arrived",            to: "in_progress" },
  add_photo:         { from: "in_progress",        to: "in_progress" },
  finish_clean:      { from: "in_progress",        to: "awaiting_checkout" },
  checkout:          { from: "awaiting_checkout",  to: "completed" },
  reset:             { from: null,                 to: "confirmed" },
};

/** Advance the state machine. */
serviceDemoRouter.post(
  "/t/:txId/action",
  zValidator("json", z.object({ action: z.enum(VALID_ACTIONS) })),
  async (c) => {
    const txId = c.req.param("txId");
    const { action } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);

    const rows = (await sql`
      SELECT id, day_status, photo_count FROM dos_test_sessions WHERE id = ${txId}
    `) as SessionRow[];
    if (!rows[0]) return c.json({ error: "Session not found" }, 404);

    const session = rows[0];
    const tx = TRANSITIONS[action];

    if (tx.from !== null && session.day_status !== tx.from) {
      return c.json({
        error: `Action '${action}' requires status '${tx.from}' but current status is '${session.day_status}'`,
      }, 400);
    }

    const photoCount = action === "add_photo" ? session.photo_count + 1 : (action === "reset" ? 0 : session.photo_count);

    await sql`
      UPDATE dos_test_sessions
      SET day_status = ${tx.to}, photo_count = ${photoCount}, updated_at = NOW()
      WHERE id = ${txId}
    `;

    return c.json({ ok: true, dayStatus: tx.to, photoCount });
  }
);
