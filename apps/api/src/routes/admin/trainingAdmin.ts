/**
 * Admin training management routes.
 * All routes require auth + admin role check.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../../lib/db";
import { requireAuth } from "../../middleware/auth";
import { isOwnerClerkId } from "../../lib/owner";
import type { AppBindings } from "../../types";

export const trainingAdminRouter = new Hono<AppBindings>();

trainingAdminRouter.use("*", requireAuth);

// Admin check middleware
trainingAdminRouter.use("*", async (c, next) => {
  if (isOwnerClerkId(c.get("user").clerkId, c.env)) return next();
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");
  const user = await getUserByClerkId(sql, authUser.clerkId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModuleRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  required_type: string;
  service_key: string | null;
  estimated_minutes: number | null;
  active: boolean;
  sort_order: number;
  requires_quiz: boolean;
  passing_score: number;
  max_attempts: number;
  version: number;
  created_at: string;
  updated_at: string;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const moduleSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().optional(),
  required_type: z.enum(["base", "service_specific", "optional"]),
  service_key: z.string().optional(),
  estimated_minutes: z.number().int().positive().optional(),
  sort_order: z.number().int().default(0),
  requires_quiz: z.boolean().default(true),
  passing_score: z.number().int().min(0).max(100).default(80),
  max_attempts: z.number().int().positive().default(3),
  active: z.boolean().default(true),
});

const patchModuleSchema = moduleSchema.partial();

const lessonSchema = z.object({
  title: z.string().min(1).max(255),
  body: z.string().min(1),
  video_url: z.string().url().optional(),
  image_url: z.string().url().optional(),
  sort_order: z.number().int().default(0),
  estimated_minutes: z.number().int().positive().optional(),
});

const questionSchema = z.object({
  question: z.string().min(1),
  type: z.string().default("multiple_choice"),
  choices: z.array(z.string()).min(2),
  correct_answer: z.string().min(1),
  explanation: z.string().optional(),
  sort_order: z.number().int().default(0),
});

// ─── GET /admin/training/modules ─────────────────────────────────────────────

trainingAdminRouter.get("/modules", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);

  const modules = (await sql`
    SELECT id, title, description, category, required_type, service_key,
           estimated_minutes, active, sort_order, requires_quiz, passing_score,
           max_attempts, version, created_at, updated_at
    FROM training_modules
    ORDER BY required_type ASC, sort_order ASC
  `) as ModuleRow[];

  // Attach lesson and question counts
  const ids = modules.map((m) => m.id);
  const lessonCounts =
    ids.length > 0
      ? ((await sql`
          SELECT module_id, COUNT(*) as count
          FROM training_lessons
          WHERE module_id = ANY(${ids})
          GROUP BY module_id
        `) as { module_id: string; count: string }[])
      : [];

  const questionCounts =
    ids.length > 0
      ? ((await sql`
          SELECT module_id, COUNT(*) as count
          FROM training_quiz_questions
          WHERE module_id = ANY(${ids})
          GROUP BY module_id
        `) as { module_id: string; count: string }[])
      : [];

  const lcMap = Object.fromEntries(lessonCounts.map((r) => [r.module_id, parseInt(r.count, 10)]));
  const qcMap = Object.fromEntries(questionCounts.map((r) => [r.module_id, parseInt(r.count, 10)]));

  return c.json(
    modules.map((m) => ({
      ...m,
      lessonCount: lcMap[m.id] ?? 0,
      questionCount: qcMap[m.id] ?? 0,
    }))
  );
});

// ─── POST /admin/training/modules ────────────────────────────────────────────

trainingAdminRouter.post(
  "/modules",
  zValidator("json", moduleSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const body = c.req.valid("json");

    const rows = (await sql`
      INSERT INTO training_modules
        (title, description, category, required_type, service_key, estimated_minutes,
         sort_order, requires_quiz, passing_score, max_attempts, active)
      VALUES
        (${body.title}, ${body.description ?? null}, ${body.category ?? null},
         ${body.required_type}, ${body.service_key ?? null}, ${body.estimated_minutes ?? null},
         ${body.sort_order}, ${body.requires_quiz}, ${body.passing_score}, ${body.max_attempts},
         ${body.active})
      RETURNING id
    `) as { id: string }[];

    return c.json({ id: rows[0].id }, 201);
  }
);

// ─── PATCH /admin/training/modules/:id ───────────────────────────────────────

trainingAdminRouter.patch(
  "/modules/:id",
  zValidator("json", patchModuleSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const body = c.req.valid("json");

    await sql`
      UPDATE training_modules SET
        title = COALESCE(${body.title ?? null}, title),
        description = COALESCE(${body.description ?? null}, description),
        category = COALESCE(${body.category ?? null}, category),
        required_type = COALESCE(${body.required_type ?? null}, required_type),
        service_key = COALESCE(${body.service_key ?? null}, service_key),
        estimated_minutes = COALESCE(${body.estimated_minutes ?? null}, estimated_minutes),
        sort_order = COALESCE(${body.sort_order ?? null}, sort_order),
        requires_quiz = COALESCE(${body.requires_quiz ?? null}, requires_quiz),
        passing_score = COALESCE(${body.passing_score ?? null}, passing_score),
        max_attempts = COALESCE(${body.max_attempts ?? null}, max_attempts),
        active = COALESCE(${body.active ?? null}, active),
        updated_at = NOW()
      WHERE id = ${id}
    `;

    return c.json({ ok: true });
  }
);

// ─── DELETE /admin/training/modules/:id ──────────────────────────────────────

trainingAdminRouter.delete("/modules/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");

  await sql`UPDATE training_modules SET active = false, updated_at = NOW() WHERE id = ${id}`;

  return c.json({ ok: true });
});

// ─── POST /admin/training/modules/:id/lessons ────────────────────────────────

trainingAdminRouter.post(
  "/modules/:id/lessons",
  zValidator("json", lessonSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const moduleId = c.req.param("id");
    const body = c.req.valid("json");

    const rows = (await sql`
      INSERT INTO training_lessons
        (module_id, title, body, video_url, image_url, sort_order, estimated_minutes)
      VALUES
        (${moduleId}, ${body.title}, ${body.body}, ${body.video_url ?? null},
         ${body.image_url ?? null}, ${body.sort_order}, ${body.estimated_minutes ?? null})
      RETURNING id
    `) as { id: string }[];

    return c.json({ id: rows[0].id }, 201);
  }
);

// ─── PATCH /admin/training/lessons/:id ───────────────────────────────────────

trainingAdminRouter.patch(
  "/lessons/:id",
  zValidator("json", lessonSchema.partial()),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const body = c.req.valid("json");

    await sql`
      UPDATE training_lessons SET
        title = COALESCE(${body.title ?? null}, title),
        body = COALESCE(${body.body ?? null}, body),
        video_url = COALESCE(${body.video_url ?? null}, video_url),
        image_url = COALESCE(${body.image_url ?? null}, image_url),
        sort_order = COALESCE(${body.sort_order ?? null}, sort_order),
        estimated_minutes = COALESCE(${body.estimated_minutes ?? null}, estimated_minutes),
        updated_at = NOW()
      WHERE id = ${id}
    `;

    return c.json({ ok: true });
  }
);

// ─── DELETE /admin/training/lessons/:id ──────────────────────────────────────

trainingAdminRouter.delete("/lessons/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");

  await sql`DELETE FROM training_lessons WHERE id = ${id}`;

  return c.json({ ok: true });
});

// ─── POST /admin/training/modules/:id/questions ──────────────────────────────

trainingAdminRouter.post(
  "/modules/:id/questions",
  zValidator("json", questionSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const moduleId = c.req.param("id");
    const body = c.req.valid("json");

    const rows = (await sql`
      INSERT INTO training_quiz_questions
        (module_id, question, type, choices, correct_answer, explanation, sort_order)
      VALUES
        (${moduleId}, ${body.question}, ${body.type}, ${JSON.stringify(body.choices)},
         ${body.correct_answer}, ${body.explanation ?? null}, ${body.sort_order})
      RETURNING id
    `) as { id: string }[];

    return c.json({ id: rows[0].id }, 201);
  }
);

// ─── PATCH /admin/training/questions/:id ─────────────────────────────────────

trainingAdminRouter.patch(
  "/questions/:id",
  zValidator("json", questionSchema.partial()),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const body = c.req.valid("json");

    await sql`
      UPDATE training_quiz_questions SET
        question = COALESCE(${body.question ?? null}, question),
        type = COALESCE(${body.type ?? null}, type),
        choices = COALESCE(${body.choices ? JSON.stringify(body.choices) : null}::jsonb, choices),
        correct_answer = COALESCE(${body.correct_answer ?? null}, correct_answer),
        explanation = COALESCE(${body.explanation ?? null}, explanation),
        sort_order = COALESCE(${body.sort_order ?? null}, sort_order)
      WHERE id = ${id}
    `;

    return c.json({ ok: true });
  }
);

// ─── DELETE /admin/training/questions/:id ────────────────────────────────────

trainingAdminRouter.delete("/questions/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");

  await sql`DELETE FROM training_quiz_questions WHERE id = ${id}`;

  return c.json({ ok: true });
});

// ─── GET /admin/training/cleaners/:id/progress ───────────────────────────────

trainingAdminRouter.get("/cleaners/:id/progress", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cleanerId = c.req.param("id");

  const progress = (await sql`
    SELECT ctp.id, ctp.module_id, tm.title as module_title,
           ctp.status, ctp.score, ctp.attempt_count, ctp.completed_at,
           ctp.started_at, ctp.required_for_activation
    FROM cleaner_training_progress ctp
    JOIN training_modules tm ON tm.id = ctp.module_id
    WHERE ctp.cleaner_id = ${cleanerId}
    ORDER BY tm.sort_order ASC
  `) as Array<{
    id: string;
    module_id: string;
    module_title: string;
    status: string;
    score: number | null;
    attempt_count: number;
    completed_at: string | null;
    started_at: string | null;
    required_for_activation: boolean;
  }>;

  const attempts = (await sql`
    SELECT cqa.id, cqa.module_id, tm.title as module_title,
           cqa.score, cqa.passed, cqa.started_at, cqa.completed_at
    FROM cleaner_quiz_attempts cqa
    JOIN training_modules tm ON tm.id = cqa.module_id
    WHERE cqa.cleaner_id = ${cleanerId}
    ORDER BY cqa.started_at DESC
  `) as Array<{
    id: string;
    module_id: string;
    module_title: string;
    score: number | null;
    passed: boolean;
    started_at: string;
    completed_at: string | null;
  }>;

  const cleaner = (await sql`
    SELECT id, training_status, required_training_completed, background_check_unlocked, training_completed_at
    FROM cleaners WHERE id = ${cleanerId} LIMIT 1
  `) as Array<{
    id: string;
    training_status: string | null;
    required_training_completed: boolean;
    background_check_unlocked: boolean;
    training_completed_at: string | null;
  }>;

  if (!cleaner[0]) return c.json({ error: "Cleaner not found" }, 404);

  return c.json({ cleaner: cleaner[0], progress, attempts });
});

// ─── POST /admin/training/cleaners/:id/reset-attempts ────────────────────────

const resetAttemptsSchema = z.object({
  moduleId: z.string().uuid(),
});

trainingAdminRouter.post(
  "/cleaners/:id/reset-attempts",
  zValidator("json", resetAttemptsSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const cleanerId = c.req.param("id");
    const { moduleId } = c.req.valid("json");

    await sql`
      UPDATE cleaner_training_progress
      SET attempt_count = 0,
          status = 'in_progress'
      WHERE cleaner_id = ${cleanerId} AND module_id = ${moduleId}
    `;

    return c.json({ ok: true });
  }
);
