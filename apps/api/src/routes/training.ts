/**
 * Training academy routes — cleaner-facing.
 * All routes require authentication via requireAuth middleware.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";

export const trainingRouter = new Hono<AppBindings>();

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrainingModuleRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  required_type: string;
  service_key: string | null;
  estimated_minutes: number | null;
  sort_order: number;
  requires_quiz: boolean;
  passing_score: number;
  max_attempts: number;
  version: number;
}

interface TrainingLessonRow {
  id: string;
  module_id: string;
  title: string;
  body: string;
  video_url: string | null;
  image_url: string | null;
  sort_order: number;
  estimated_minutes: number | null;
}

interface QuizQuestionRow {
  id: string;
  module_id: string;
  question: string;
  type: string;
  choices: string[];
  sort_order: number;
}

interface QuizQuestionWithAnswer extends QuizQuestionRow {
  correct_answer: string;
  explanation: string | null;
}

interface ProgressRow {
  id: string;
  module_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  last_lesson_id: string | null;
  score: number | null;
  attempt_count: number;
  required_for_activation: boolean;
}

interface CleanerRow {
  id: string;
  training_status: string | null;
  required_training_completed: boolean;
  background_check_unlocked: boolean;
}

// ─── Helper: resolve cleaner ID from user ─────────────────────────────────────

async function getCleanerId(
  sql: ReturnType<typeof getDb>,
  clerkId: string
): Promise<string | null> {
  const rows = (await sql`
    SELECT c.id FROM cleaners c
    JOIN users u ON u.id = c.user_id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `) as { id: string }[];
  return rows[0]?.id ?? null;
}

// ─── GET /training/modules ────────────────────────────────────────────────────
// List required modules for this cleaner (base + service-specific for their services).

trainingRouter.get("/modules", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");

  const user = await getUserByClerkId(sql, authUser.clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);

  const cleanerId = await getCleanerId(sql, authUser.clerkId);

  // Get all active base modules
  const baseModules = (await sql`
    SELECT id, title, description, category, required_type, service_key,
           estimated_minutes, sort_order, requires_quiz, passing_score, max_attempts, version
    FROM training_modules
    WHERE required_type = 'base' AND active = true
    ORDER BY sort_order ASC
  `) as TrainingModuleRow[];

  // Get service-specific modules based on cleaner's registered services
  let serviceModules: TrainingModuleRow[] = [];
  if (cleanerId) {
    serviceModules = (await sql`
      SELECT DISTINCT tm.id, tm.title, tm.description, tm.category, tm.required_type,
             tm.service_key, tm.estimated_minutes, tm.sort_order, tm.requires_quiz,
             tm.passing_score, tm.max_attempts, tm.version
      FROM training_modules tm
      WHERE tm.required_type = 'service_specific'
        AND tm.active = true
      ORDER BY tm.sort_order ASC
    `) as TrainingModuleRow[];
  }

  const allModules = [...baseModules, ...serviceModules];

  // Get progress for each module if cleaner exists
  let progressMap: Record<string, ProgressRow> = {};
  if (cleanerId && allModules.length > 0) {
    const moduleIds = allModules.map((m) => m.id);
    const progress = (await sql`
      SELECT id, module_id, status, started_at, completed_at, last_lesson_id,
             score, attempt_count, required_for_activation
      FROM cleaner_training_progress
      WHERE cleaner_id = ${cleanerId}
        AND module_id = ANY(${moduleIds})
    `) as ProgressRow[];
    progressMap = Object.fromEntries(progress.map((p) => [p.module_id, p]));
  }

  const result = allModules.map((m) => ({
    ...m,
    progress: progressMap[m.id] ?? null,
  }));

  return c.json({ modules: result });
});

// ─── GET /training/modules/:id ────────────────────────────────────────────────
// Module detail with lessons.

trainingRouter.get("/modules/:id", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");
  const moduleId = c.req.param("id");

  const modules = (await sql`
    SELECT id, title, description, category, required_type, service_key,
           estimated_minutes, sort_order, requires_quiz, passing_score, max_attempts, version
    FROM training_modules
    WHERE id = ${moduleId} AND active = true
    LIMIT 1
  `) as TrainingModuleRow[];

  const module = modules[0];
  if (!module) return c.json({ error: "Module not found" }, 404);

  const lessons = (await sql`
    SELECT id, module_id, title, body, video_url, image_url, sort_order, estimated_minutes
    FROM training_lessons
    WHERE module_id = ${moduleId}
    ORDER BY sort_order ASC
  `) as TrainingLessonRow[];

  const cleanerId = await getCleanerId(sql, authUser.clerkId);
  let progress: ProgressRow | null = null;
  if (cleanerId) {
    const rows = (await sql`
      SELECT id, module_id, status, started_at, completed_at, last_lesson_id,
             score, attempt_count, required_for_activation
      FROM cleaner_training_progress
      WHERE cleaner_id = ${cleanerId} AND module_id = ${moduleId}
      LIMIT 1
    `) as ProgressRow[];
    progress = rows[0] ?? null;
  }

  return c.json({ module, lessons, progress });
});

// ─── POST /training/modules/:id/start ─────────────────────────────────────────
// Create or reset progress record to in_progress.

trainingRouter.post("/modules/:id/start", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");
  const moduleId = c.req.param("id");

  const user = await getUserByClerkId(sql, authUser.clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);

  const cleanerId = await getCleanerId(sql, authUser.clerkId);
  if (!cleanerId) return c.json({ error: "Cleaner record not found" }, 404);

  const modules = (await sql`
    SELECT id, version FROM training_modules WHERE id = ${moduleId} AND active = true LIMIT 1
  `) as { id: string; version: number }[];
  if (!modules[0]) return c.json({ error: "Module not found" }, 404);

  const { version } = modules[0];

  // Upsert progress record
  const rows = (await sql`
    INSERT INTO cleaner_training_progress (cleaner_id, module_id, module_version, status, started_at)
    VALUES (${cleanerId}, ${moduleId}, ${version}, 'in_progress', NOW())
    ON CONFLICT (cleaner_id, module_id)
    DO UPDATE SET
      status = CASE
        WHEN cleaner_training_progress.status IN ('not_started') THEN 'in_progress'
        ELSE cleaner_training_progress.status
      END,
      started_at = COALESCE(cleaner_training_progress.started_at, NOW()),
      module_version = ${version}
    RETURNING id, status
  `) as { id: string; status: string }[];

  // Update cleaner training_status to in_progress if not yet started
  await sql`
    UPDATE cleaners
    SET training_status = CASE
      WHEN training_status = 'not_started' OR training_status IS NULL THEN 'in_progress'
      ELSE training_status
    END
    WHERE id = ${cleanerId}
  `;

  return c.json({ progressId: rows[0].id, status: rows[0].status });
});

// ─── POST /training/lessons/:id/complete ──────────────────────────────────────
// Mark a lesson as the last completed lesson for this module.

const completeLessonSchema = z.object({
  moduleId: z.string().uuid(),
});

trainingRouter.post(
  "/lessons/:id/complete",
  requireAuth,
  zValidator("json", completeLessonSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const authUser = c.get("user");
    const lessonId = c.req.param("id");
    const { moduleId } = c.req.valid("json");

    const cleanerId = await getCleanerId(sql, authUser.clerkId);
    if (!cleanerId) return c.json({ error: "Cleaner record not found" }, 404);

    // Verify lesson belongs to module
    const lessons = (await sql`
      SELECT id FROM training_lessons WHERE id = ${lessonId} AND module_id = ${moduleId} LIMIT 1
    `) as { id: string }[];
    if (!lessons[0]) return c.json({ error: "Lesson not found" }, 404);

    // Check if all lessons in the module are now completed (by seeing if this is the last)
    const totalLessons = (await sql`
      SELECT COUNT(*) as count FROM training_lessons WHERE module_id = ${moduleId}
    `) as { count: string }[];

    const lessonOrder = (await sql`
      SELECT sort_order FROM training_lessons WHERE id = ${lessonId} LIMIT 1
    `) as { sort_order: number }[];

    const maxOrder = (await sql`
      SELECT MAX(sort_order) as max_order FROM training_lessons WHERE module_id = ${moduleId}
    `) as { max_order: number }[];

    const isLastLesson =
      lessonOrder[0]?.sort_order === maxOrder[0]?.max_order;

    await sql`
      INSERT INTO cleaner_training_progress (cleaner_id, module_id, last_lesson_id, status, started_at, module_version)
      SELECT ${cleanerId}, ${moduleId}, ${lessonId}, 'in_progress', NOW(),
             (SELECT version FROM training_modules WHERE id = ${moduleId})
      ON CONFLICT (cleaner_id, module_id)
      DO UPDATE SET last_lesson_id = ${lessonId}
    `;

    return c.json({
      ok: true,
      isLastLesson,
      totalLessons: parseInt(totalLessons[0]?.count ?? "0", 10),
    });
  }
);

// ─── GET /training/modules/:id/quiz ───────────────────────────────────────────
// Get quiz questions — correct_answer NOT exposed.

trainingRouter.get("/modules/:id/quiz", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const moduleId = c.req.param("id");

  const cleanerId = await getCleanerId(sql, c.get("user").clerkId);
  if (!cleanerId) return c.json({ error: "Cleaner record not found" }, 404);

  const modules = (await sql`
    SELECT id, passing_score, max_attempts, requires_quiz
    FROM training_modules WHERE id = ${moduleId} AND active = true LIMIT 1
  `) as { id: string; passing_score: number; max_attempts: number; requires_quiz: boolean }[];
  if (!modules[0]) return c.json({ error: "Module not found" }, 404);

  // Check attempt count
  const progress = (await sql`
    SELECT attempt_count, status FROM cleaner_training_progress
    WHERE cleaner_id = ${cleanerId} AND module_id = ${moduleId}
    LIMIT 1
  `) as { attempt_count: number; status: string }[];

  const attemptCount = progress[0]?.attempt_count ?? 0;
  const { max_attempts, passing_score } = modules[0];

  if (attemptCount >= max_attempts && progress[0]?.status === "failed") {
    return c.json({
      error: "Maximum attempts reached",
      attemptCount,
      maxAttempts: max_attempts,
    }, 403);
  }

  const questions = (await sql`
    SELECT id, module_id, question, type, choices, sort_order
    FROM training_quiz_questions
    WHERE module_id = ${moduleId}
    ORDER BY sort_order ASC
  `) as QuizQuestionRow[];

  return c.json({
    questions,
    passingScore: passing_score,
    maxAttempts: max_attempts,
    attemptCount,
  });
});

// ─── POST /training/modules/:id/quiz ──────────────────────────────────────────
// Submit answers, grade, return score + explanations.

const submitQuizSchema = z.object({
  answers: z.record(z.string(), z.string()),
});

trainingRouter.post(
  "/modules/:id/quiz",
  requireAuth,
  zValidator("json", submitQuizSchema),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const authUser = c.get("user");
    const moduleId = c.req.param("id");
    const { answers } = c.req.valid("json");

    const user = await getUserByClerkId(sql, authUser.clerkId);
    if (!user) return c.json({ error: "User not found" }, 404);

    const cleanerId = await getCleanerId(sql, authUser.clerkId);
    if (!cleanerId) return c.json({ error: "Cleaner record not found" }, 404);

    const modules = (await sql`
      SELECT id, passing_score, max_attempts, requires_quiz
      FROM training_modules WHERE id = ${moduleId} AND active = true LIMIT 1
    `) as { id: string; passing_score: number; max_attempts: number }[];
    if (!modules[0]) return c.json({ error: "Module not found" }, 404);

    const { passing_score, max_attempts } = modules[0];

    // Check attempt count
    const existingProgress = (await sql`
      SELECT attempt_count, status FROM cleaner_training_progress
      WHERE cleaner_id = ${cleanerId} AND module_id = ${moduleId}
      LIMIT 1
    `) as { attempt_count: number; status: string }[];

    const currentAttempts = existingProgress[0]?.attempt_count ?? 0;

    if (
      currentAttempts >= max_attempts &&
      existingProgress[0]?.status === "failed"
    ) {
      return c.json({ error: "Maximum attempts reached" }, 403);
    }

    // Fetch questions with correct answers
    const questions = (await sql`
      SELECT id, question, choices, correct_answer, explanation, sort_order
      FROM training_quiz_questions
      WHERE module_id = ${moduleId}
      ORDER BY sort_order ASC
    `) as QuizQuestionWithAnswer[];

    if (questions.length === 0) {
      return c.json({ error: "No questions found for this module" }, 404);
    }

    // Grade
    let correct = 0;
    const results = questions.map((q) => {
      const submitted = answers[q.id];
      const isCorrect = submitted === q.correct_answer;
      if (isCorrect) correct++;
      return {
        questionId: q.id,
        question: q.question,
        submittedAnswer: submitted ?? null,
        correctAnswer: q.correct_answer,
        isCorrect,
        explanation: q.explanation,
      };
    });

    const score = Math.round((correct / questions.length) * 100);
    const passed = score >= passing_score;
    const newAttemptCount = currentAttempts + 1;

    // Record the attempt
    await sql`
      INSERT INTO cleaner_quiz_attempts (cleaner_id, module_id, score, passed, answers, completed_at)
      VALUES (${cleanerId}, ${moduleId}, ${score}, ${passed}, ${JSON.stringify(answers)}, NOW())
    `;

    // Update progress
    const newStatus = passed
      ? "passed"
      : newAttemptCount >= max_attempts
      ? "failed"
      : "in_progress";

    await sql`
      INSERT INTO cleaner_training_progress
        (cleaner_id, module_id, status, score, attempt_count, completed_at, started_at, module_version)
      SELECT ${cleanerId}, ${moduleId}, ${newStatus}, ${score}, ${newAttemptCount},
             ${passed ? "NOW()" : null}::timestamptz,
             NOW(),
             (SELECT version FROM training_modules WHERE id = ${moduleId})
      ON CONFLICT (cleaner_id, module_id)
      DO UPDATE SET
        status = ${newStatus},
        score = ${score},
        attempt_count = ${newAttemptCount},
        completed_at = CASE WHEN ${passed} THEN NOW() ELSE cleaner_training_progress.completed_at END
    `;

    // If passed, check if all required modules are now complete
    if (passed) {
      const totalRequired = (await sql`
        SELECT COUNT(*) as count FROM training_modules
        WHERE required_type IN ('base') AND active = true
      `) as { count: string }[];

      const totalPassed = (await sql`
        SELECT COUNT(*) as count FROM cleaner_training_progress ctp
        JOIN training_modules tm ON tm.id = ctp.module_id
        WHERE ctp.cleaner_id = ${cleanerId}
          AND ctp.status = 'passed'
          AND tm.required_type = 'base'
          AND tm.active = true
      `) as { count: string }[];

      const allDone =
        parseInt(totalPassed[0]?.count ?? "0", 10) >=
        parseInt(totalRequired[0]?.count ?? "1", 10);

      if (allDone) {
        await sql`
          UPDATE cleaners
          SET required_training_completed = true,
              background_check_unlocked = true,
              training_status = 'completed',
              training_completed_at = NOW()
          WHERE id = ${cleanerId}
        `;
      }
    }

    return c.json({
      score,
      passed,
      passingScore: passing_score,
      attemptCount: newAttemptCount,
      maxAttempts: max_attempts,
      attemptsRemaining: Math.max(0, max_attempts - newAttemptCount),
      results,
    });
  }
);

// ─── GET /training/progress ───────────────────────────────────────────────────
// Full progress summary for the dashboard.

trainingRouter.get("/progress", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");

  const user = await getUserByClerkId(sql, authUser.clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);

  const cleanerId = await getCleanerId(sql, authUser.clerkId);
  if (!cleanerId) {
    return c.json({
      modules: [],
      summary: {
        totalRequired: 0,
        totalPassed: 0,
        allRequiredComplete: false,
        backgroundCheckUnlocked: false,
      },
    });
  }

  const cleaners = (await sql`
    SELECT id, training_status, required_training_completed, background_check_unlocked
    FROM cleaners WHERE id = ${cleanerId} LIMIT 1
  `) as CleanerRow[];
  const cleaner = cleaners[0];

  const modules = (await sql`
    SELECT tm.id, tm.title, tm.required_type, tm.service_key, tm.sort_order,
           tm.estimated_minutes, tm.passing_score, tm.max_attempts,
           ctp.status, ctp.score, ctp.attempt_count, ctp.completed_at, ctp.last_lesson_id
    FROM training_modules tm
    LEFT JOIN cleaner_training_progress ctp
      ON ctp.module_id = tm.id AND ctp.cleaner_id = ${cleanerId}
    WHERE tm.active = true AND tm.required_type IN ('base', 'service_specific')
    ORDER BY tm.required_type ASC, tm.sort_order ASC
  `) as Array<{
    id: string;
    title: string;
    required_type: string;
    service_key: string | null;
    sort_order: number;
    estimated_minutes: number | null;
    passing_score: number;
    max_attempts: number;
    status: string | null;
    score: number | null;
    attempt_count: number | null;
    completed_at: string | null;
    last_lesson_id: string | null;
  }>;

  const totalRequired = modules.filter((m) => m.required_type === "base").length;
  const totalPassed = modules.filter(
    (m) => m.required_type === "base" && m.status === "passed"
  ).length;

  return c.json({
    modules,
    summary: {
      totalRequired,
      totalPassed,
      allRequiredComplete: cleaner?.required_training_completed ?? false,
      backgroundCheckUnlocked: cleaner?.background_check_unlocked ?? false,
      trainingStatus: cleaner?.training_status ?? "not_started",
    },
  });
});
