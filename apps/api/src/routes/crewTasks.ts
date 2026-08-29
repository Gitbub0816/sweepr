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
 * Crew Tasks API (Team Cleans).
 *
 * Read the labor-balanced task board for a booking and let a crew member mark
 * their task complete. When a member finishes ALL of their own tasks they
 * dynamically pick up remaining pending team tasks (docs/team-cleans-audit.md
 * §29) via reallocateForFinishedCleaner.
 *
 * Authorization (crew-aware, wider than getBookingAuthCtx which only knows the
 * LEAD via bookings.cleaner_id): admins, the LEAD, and any ACCEPTED/COMPLETED
 * crew MEMBER of the booking may read; only the cleaner a task is assigned to
 * (or an admin) may complete it. Customers are NOT task-board readers.
 *
 * Gated on the team_task_allocation_enabled + team_cleans_enabled flags — with
 * either off the endpoints report the feature is disabled (no crew data leaks).
 *
 * ── MOUNTING (do this in apps/api/src/index.ts; NOT edited here) ─────────────
 *   import { crewTasksRouter } from "./routes/crewTasks";
 *   app.route("/jobs", crewTasksRouter);   // → GET /jobs/bookings/:id/tasks, etc.
 * Mount under the same base the cleaner day-of-service app already uses for
 * /bookings/:id/live (that router is mounted at "/jobs"), so the paths line up:
 *   GET  /jobs/bookings/:id/tasks
 *   POST /jobs/bookings/:id/tasks/:task/complete
 * requireAuth is applied inside this router, so no extra middleware is needed.
 */

import { Hono } from "hono";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { isTeamFlagEnabled } from "../lib/crew/crewConfig";
import { reallocateForFinishedCleaner, type LiveTask } from "../lib/crew/taskAllocation";
import type { AppBindings } from "../types";
import type { Sql } from "../lib/db";

export const crewTasksRouter = new Hono<AppBindings>();

crewTasksRouter.use("*", requireAuth);

interface CallerCtx {
  userId: string | null;
  cleanerId: string | null;
  isAdmin: boolean;
}

/** Resolve the caller's users/cleaners rows + admin flag from the clerk id. */
async function resolveCaller(sql: Sql, clerkId: string): Promise<CallerCtx> {
  const rows = (await sql`
    SELECT u.id AS user_id, u.role AS role, cl.id AS cleaner_id
    FROM users u
    LEFT JOIN cleaners cl ON cl.user_id = u.id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `) as Array<{ user_id: string | null; role: string | null; cleaner_id: string | null }>;
  const row = rows[0];
  return {
    userId: row?.user_id ?? null,
    cleanerId: row?.cleaner_id ?? null,
    isAdmin: row?.role === "admin" || row?.role === "super_admin",
  };
}

/** Whether `cleanerId` is on the booking's crew (LEAD pointer OR a seat row). */
async function isCrewMember(sql: Sql, bookingId: string, cleanerId: string): Promise<boolean> {
  const rows = (await sql`
    SELECT 1
    FROM bookings b
    WHERE b.id = ${bookingId} AND b.cleaner_id = ${cleanerId}
    UNION
    SELECT 1
    FROM booking_crew_assignments a
    WHERE a.booking_id = ${bookingId}
      AND a.cleaner_id = ${cleanerId}
      AND a.status IN ('ACCEPTED', 'COMPLETED')
    LIMIT 1
  `) as Array<unknown>;
  return rows.length > 0;
}

interface TaskRow {
  id: string;
  booking_id: string;
  room_type: string | null;
  area_label: string;
  cleaning_level: string | null;
  task_type: string;
  estimated_minutes: number;
  parallelizable: boolean;
  required_qualification: string | null;
  assigned_cleaner_id: string | null;
  status: "pending" | "in_progress" | "complete";
}

async function loadTasks(sql: Sql, bookingId: string): Promise<TaskRow[]> {
  return (await sql`
    SELECT id, booking_id, room_type, area_label, cleaning_level, task_type,
           estimated_minutes, parallelizable, required_qualification,
           assigned_cleaner_id, status
    FROM cleaning_tasks
    WHERE booking_id = ${bookingId}
    ORDER BY estimated_minutes DESC, id ASC
  `) as TaskRow[];
}

/** Per-cleaner workload rollup for the board (assigned + remaining minutes). */
function summarize(tasks: TaskRow[]) {
  const byCleaner = new Map<string, { assignedMinutes: number; remainingMinutes: number; taskIds: string[] }>();
  for (const t of tasks) {
    if (!t.assigned_cleaner_id) continue;
    const entry = byCleaner.get(t.assigned_cleaner_id) ?? {
      assignedMinutes: 0,
      remainingMinutes: 0,
      taskIds: [],
    };
    entry.assignedMinutes += t.estimated_minutes;
    if (t.status !== "complete") entry.remainingMinutes += t.estimated_minutes;
    entry.taskIds.push(t.id);
    byCleaner.set(t.assigned_cleaner_id, entry);
  }
  return Array.from(byCleaner.entries()).map(([cleanerId, v]) => ({ cleanerId, ...v }));
}

// ─── GET /bookings/:id/tasks ─────────────────────────────────────────────────
crewTasksRouter.get("/bookings/:id/tasks", async (c) => {
  const bookingId = c.req.param("id");
  const clerkId = c.get("user").clerkId;
  const sql = getDb(c.env.DATABASE_URL);

  if (!(await isTeamFlagEnabled(sql, "taskAllocation")) || !(await isTeamFlagEnabled(sql, "enabled"))) {
    return c.json({ error: "Team task allocation is not enabled" }, 404);
  }

  const caller = await resolveCaller(sql, clerkId);
  const authorized =
    caller.isAdmin || (!!caller.cleanerId && (await isCrewMember(sql, bookingId, caller.cleanerId)));
  if (!authorized) return c.json({ error: "Forbidden" }, 403);

  const tasks = await loadTasks(sql, bookingId);
  return c.json({
    bookingId,
    tasks: tasks.map((t) => ({
      id: t.id,
      roomType: t.room_type,
      areaLabel: t.area_label,
      cleaningLevel: t.cleaning_level,
      taskType: t.task_type,
      estimatedMinutes: t.estimated_minutes,
      parallelizable: t.parallelizable,
      requiredQualification: t.required_qualification,
      assignedCleanerId: t.assigned_cleaner_id,
      status: t.status,
    })),
    workloads: summarize(tasks),
  });
});

// ─── POST /bookings/:id/tasks/:task/complete ─────────────────────────────────
crewTasksRouter.post("/bookings/:id/tasks/:task/complete", async (c) => {
  const bookingId = c.req.param("id");
  const taskId = c.req.param("task");
  const clerkId = c.get("user").clerkId;
  const sql = getDb(c.env.DATABASE_URL);

  if (!(await isTeamFlagEnabled(sql, "taskAllocation")) || !(await isTeamFlagEnabled(sql, "enabled"))) {
    return c.json({ error: "Team task allocation is not enabled" }, 404);
  }

  const caller = await resolveCaller(sql, clerkId);
  if (!caller.cleanerId && !caller.isAdmin) return c.json({ error: "Forbidden" }, 403);

  // Claim-then-act: only flip a task the caller owns (or admin) that is not
  // already complete. Conditional UPDATE … RETURNING is the race guard.
  const claimed = (await sql`
    UPDATE cleaning_tasks
    SET status = 'complete', updated_at = NOW()
    WHERE id = ${taskId}
      AND booking_id = ${bookingId}
      AND status <> 'complete'
      AND (${caller.isAdmin} OR assigned_cleaner_id = ${caller.cleanerId})
    RETURNING id, assigned_cleaner_id
  `) as Array<{ id: string; assigned_cleaner_id: string | null }>;

  if (claimed.length === 0) {
    // Distinguish "already done / not found" from "not yours".
    const exists = (await sql`
      SELECT status, assigned_cleaner_id FROM cleaning_tasks
      WHERE id = ${taskId} AND booking_id = ${bookingId} LIMIT 1
    `) as Array<{ status: string; assigned_cleaner_id: string | null }>;
    if (exists.length === 0) return c.json({ error: "Task not found" }, 404);
    if (exists[0].status === "complete") return c.json({ ok: true, alreadyComplete: true });
    return c.json({ error: "Forbidden" }, 403);
  }

  const finisherCleanerId = claimed[0].assigned_cleaner_id;

  // ─── Dynamic pickup (§29): if the finisher has no open work left, hand them
  // remaining pending team tasks so a finished cleaner keeps helping.
  const pickedUp: string[] = [];
  if (finisherCleanerId) {
    const rows = await loadTasks(sql, bookingId);
    const live: LiveTask[] = rows.map((t) => ({
      id: t.id,
      estimatedMinutes: t.estimated_minutes,
      requiredQualification: t.required_qualification,
      assignedCleanerId: t.assigned_cleaner_id,
      status: t.status,
    }));
    const plan = reallocateForFinishedCleaner(live, finisherCleanerId);
    for (const r of plan.reassignments) {
      const moved = (await sql`
        UPDATE cleaning_tasks
        SET assigned_cleaner_id = ${r.toCleanerId}, updated_at = NOW()
        WHERE id = ${r.taskId} AND booking_id = ${bookingId} AND status = 'pending'
        RETURNING id
      `) as Array<{ id: string }>;
      if (moved.length > 0) pickedUp.push(r.taskId);
    }
  }

  return c.json({ ok: true, taskId, pickedUp });
});
