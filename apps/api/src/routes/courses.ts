/**
 * Learner-facing course routes (next-generation course builder).
 * Serves PUBLISHED course versions only, and records learner progress.
 * Correct quiz answers are never sent to the learner.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";

export const coursesRouter = new Hono<AppBindings>();

coursesRouter.use("*", requireAuth);

/** List published courses. */
coursesRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const courses = await sql`
    SELECT c.id, c.title, c.description, c.category, c.required,
           c.current_version_id, cv.version_number
    FROM courses c
    JOIN course_versions cv ON cv.id = c.current_version_id
    WHERE c.status = 'published' AND cv.status = 'published'
    ORDER BY c.title ASC
  `;
  return c.json({ courses });
});

/** Get a published course's current version with slides + blocks (answers stripped). */
coursesRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);

  const [course] = await sql`
    SELECT c.id, c.title, c.description, c.category, c.current_version_id
    FROM courses c
    WHERE c.id = ${id} AND c.status = 'published' LIMIT 1
  ` as Array<{ id: string; current_version_id: string }>;
  if (!course || !course.current_version_id) return c.json({ error: "Not found" }, 404);

  const slides = await sql`
    SELECT id, title, slide_type, slide_order, background, completion_rule
    FROM course_slides WHERE course_version_id = ${course.current_version_id}
    ORDER BY slide_order ASC
  ` as Array<{ id: string }>;

  const slideIds = slides.map((s) => s.id);
  const blocks = slideIds.length
    ? await sql`
        SELECT id, slide_id, block_type, x, y, width, height, z_index, props
        FROM slide_blocks WHERE slide_id = ANY(${slideIds}) ORDER BY z_index ASC
      ` as Array<{ id: string; slide_id: string; block_type: string }>
    : [];

  // Attach quiz questions/answers (without is_correct) to quiz blocks.
  const quizBlockIds = blocks.filter((b) => b.block_type === "quiz").map((b) => b.id);
  const questions = quizBlockIds.length
    ? await sql`
        SELECT id, block_id, question_text, question_type, required, points, sort_order
        FROM course_quiz_questions WHERE block_id = ANY(${quizBlockIds}) ORDER BY sort_order ASC
      ` as Array<{ id: string; block_id: string }>
    : [];
  const questionIds = questions.map((q) => q.id);
  const answers = questionIds.length
    ? await sql`
        SELECT id, question_id, answer_text, sort_order
        FROM course_quiz_answers WHERE question_id = ANY(${questionIds}) ORDER BY sort_order ASC
      ` as Array<{ id: string; question_id: string }>
    : [];

  const blocksOut = blocks.map((b) => {
    if (b.block_type !== "quiz") return b;
    const qs = questions.filter((q) => q.block_id === b.id).map((q) => ({
      ...q,
      answers: answers.filter((a) => a.question_id === q.id),
    }));
    return { ...b, questions: qs };
  });

  const slidesWithBlocks = slides.map((s) => ({
    ...s,
    blocks: blocksOut.filter((b) => (b as { slide_id: string }).slide_id === (s as { id: string }).id),
  }));

  return c.json({ course, version_id: course.current_version_id, slides: slidesWithBlocks });
});

/** Upsert learner progress for a course version. */
coursesRouter.post(
  "/:id/progress",
  zValidator("json", z.object({
    course_version_id: z.string().uuid(),
    progress_percent: z.number().int().min(0).max(100),
    completed: z.boolean().default(false),
    slide_id: z.string().uuid().optional(),
    seconds_spent: z.number().int().min(0).optional(),
  })),
  async (c) => {
    const input = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const userId = c.get("user").clerkId;

    const [progress] = await sql`
      INSERT INTO user_course_progress (user_id, course_version_id, status, progress_percent, completed_at)
      VALUES (${userId}, ${input.course_version_id},
              ${input.completed ? "completed" : "in_progress"},
              ${input.progress_percent},
              ${input.completed ? new Date().toISOString() : null})
      ON CONFLICT (user_id, course_version_id) DO UPDATE SET
        progress_percent = GREATEST(user_course_progress.progress_percent, ${input.progress_percent}),
        status = ${input.completed ? "completed" : "in_progress"},
        completed_at = COALESCE(user_course_progress.completed_at, ${input.completed ? new Date().toISOString() : null})
      RETURNING id
    ` as Array<{ id: string }>;

    if (input.slide_id) {
      await sql`
        INSERT INTO user_slide_progress (user_progress_id, slide_id, viewed, completed, seconds_spent)
        VALUES (${progress.id}, ${input.slide_id}, true, ${input.completed}, ${input.seconds_spent ?? 0})
        ON CONFLICT (user_progress_id, slide_id) DO UPDATE SET
          viewed = true,
          completed = user_slide_progress.completed OR ${input.completed},
          seconds_spent = user_slide_progress.seconds_spent + ${input.seconds_spent ?? 0}
      `;
    }

    return c.json({ ok: true });
  }
);
