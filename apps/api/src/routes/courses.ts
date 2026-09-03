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
 * Learner-facing course routes (next-generation course builder).
 *
 * Serves PUBLISHED course versions only, localized to the requested locale
 * (?locale=es — one course record, per-locale content overlays) and
 * SANITIZED: every answer key (correct flags, sort categories, correctOrder,
 * hotspot regions) and feedback string is stripped or replaced with an
 * answer-free derived shape before it leaves the server — see
 * @sweepr/utils's sanitizeCourseBlockPropsForLearner.
 *
 * Interactions grade SERVER-SIDE: the player POSTs the learner's response to
 * /:id/respond and renders the verdict + feedback this route returns
 * (gradeCourseBlock — the same specs the validators use). Pass/fail courses
 * (course_versions.settings.passingScorePct) complete only through
 * /:id/finish, which scores the attempt and applies the retake rules.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  courseFeedbackFor,
  gradeCourseBlock,
  isCourseGradableBlockType,
  localizeCourseBlockProps,
  localizeCourseFields,
  sanitizeCourseBlockPropsForLearner,
  COURSE_GRADABLE_BLOCK_TYPES,
  type CourseAssessmentSettings,
} from "@sweepr/utils";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { recomputeTrainingCompletion } from "../lib/trainingCompletion";
import type { AppBindings } from "../types";

export const coursesRouter = new Hono<AppBindings>();

/** Mirrors training.ts's own helper — a learner may not have a `cleaners`
 *  row at all (courses are a general "learner" concept), in which case
 *  there's nothing to recompute completion flags for. */
async function getCleanerId(sql: ReturnType<typeof getDb>, clerkId: string): Promise<string | null> {
  const rows = (await sql`
    SELECT c.id FROM cleaners c
    JOIN users u ON u.id = c.user_id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `) as { id: string }[];
  return rows[0]?.id ?? null;
}

function effectiveLocale(
  requested: string | undefined,
  defaultLocale: string,
  supported: unknown,
): string {
  const list = Array.isArray(supported) ? (supported as string[]) : [defaultLocale];
  return requested && list.includes(requested) ? requested : defaultLocale;
}

function versionSettings(raw: unknown): CourseAssessmentSettings {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as CourseAssessmentSettings)
    : {};
}

coursesRouter.use("*", requireAuth);

/** List published courses (titles/descriptions localized when asked). */
coursesRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const locale = c.req.query("locale");
  const courses = (await sql`
    SELECT c.id, c.title, c.description, c.category, c.required,
           c.current_version_id, c.default_locale, c.supported_locales, c.i18n,
           cv.version_number
    FROM courses c
    JOIN course_versions cv ON cv.id = c.current_version_id
    WHERE c.status = 'published' AND cv.status = 'published'
    ORDER BY c.title ASC
  `) as Array<Record<string, unknown>>;

  const out = courses.map((row) => {
    const loc = effectiveLocale(locale, String(row.default_locale ?? "en"), row.supported_locales);
    const localized = localizeCourseFields(row, row.i18n, loc, ["title", "description"]);
    const { i18n: _i18n, ...rest } = localized;
    return rest;
  });
  return c.json({ courses: out });
});

/**
 * Get a published course's current version with slides + blocks — localized,
 * with every answer stripped — plus the learner's own progress/verdicts so a
 * reopened course resumes where it left off.
 */
coursesRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);
  const userId = c.get("user").clerkId;

  const [course] = (await sql`
    SELECT c.id, c.title, c.description, c.category, c.current_version_id,
           c.default_locale, c.supported_locales, c.i18n
    FROM courses c
    WHERE c.id = ${id} AND c.status = 'published' LIMIT 1
  `) as Array<Record<string, unknown> & { id: string; current_version_id: string | null }>;
  if (!course || !course.current_version_id) return c.json({ error: "Not found" }, 404);

  const [version] = (await sql`
    SELECT id, settings FROM course_versions WHERE id = ${course.current_version_id} LIMIT 1
  `) as Array<{ id: string; settings: unknown }>;

  const locale = effectiveLocale(
    c.req.query("locale"),
    String(course.default_locale ?? "en"),
    course.supported_locales,
  );

  const slides = (await sql`
    SELECT id, title, slide_type, slide_order, background, completion_rule, i18n
    FROM course_slides WHERE course_version_id = ${course.current_version_id}
    ORDER BY slide_order ASC
  `) as Array<Record<string, unknown> & { id: string }>;

  const slideIds = slides.map((s) => s.id);
  const blocks = slideIds.length
    ? ((await sql`
        SELECT id, slide_id, block_type, x, y, width, height, z_index, props
        FROM slide_blocks WHERE slide_id = ANY(${slideIds}) ORDER BY z_index ASC
      `) as Array<{ id: string; slide_id: string; block_type: string; props: Record<string, unknown> }>)
    : [];

  const slidesOut = slides.map((s) => {
    const localizedSlide = localizeCourseFields(s, s.i18n, locale, ["title"]);
    const { i18n: _i18n, ...slideRest } = localizedSlide;
    return {
      ...slideRest,
      blocks: blocks
        .filter((b) => b.slide_id === s.id)
        .map((b) => ({
          ...b,
          props: sanitizeCourseBlockPropsForLearner(
            b.block_type,
            localizeCourseBlockProps(b.props ?? {}, locale),
            b.id,
          ),
        })),
    };
  });

  // The learner's own state: current attempt + this attempt's verdicts.
  const [progress] = (await sql`
    SELECT id, attempt, status, best_score_pct FROM user_course_progress
    WHERE user_id = ${userId} AND course_version_id = ${course.current_version_id} LIMIT 1
  `) as Array<{ id: string; attempt: number; status: string; best_score_pct: string | null }>;
  const attempt = progress?.attempt ?? 1;
  const responses = progress
    ? ((await sql`
        SELECT block_id, is_correct, score_pct FROM course_interaction_responses
        WHERE user_id = ${userId} AND course_version_id = ${course.current_version_id} AND attempt = ${attempt}
      `) as Array<{ block_id: string; is_correct: boolean; score_pct: string | null }>)
    : [];

  const localizedCourse = localizeCourseFields(course, course.i18n, locale, ["title", "description"]);
  const { i18n: _i18n, ...courseRest } = localizedCourse;

  return c.json({
    course: { ...courseRest, locale },
    version_id: course.current_version_id,
    settings: versionSettings(version?.settings),
    slides: slidesOut,
    progress: {
      attempt,
      status: progress?.status ?? "in_progress",
      responses: Object.fromEntries(
        responses.map((r) => [r.block_id, { correct: r.is_correct, scorePct: r.score_pct === null ? null : Number(r.score_pct) }]),
      ),
    },
  });
});

/** Upsert learner progress for a course version (slide-view tracking). */
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

    // A pass/fail course completes ONLY through /finish (server-scored) —
    // a client claiming completed:true here is demoted to view tracking.
    let completed = input.completed;
    if (completed) {
      const [version] = (await sql`
        SELECT settings FROM course_versions WHERE id = ${input.course_version_id} LIMIT 1
      `) as Array<{ settings: unknown }>;
      const settings = versionSettings(version?.settings);
      if (settings.passingScorePct !== undefined && settings.passingScorePct !== null) {
        completed = false;
      }
    }

    const [progress] = (await sql`
      INSERT INTO user_course_progress (user_id, course_version_id, status, progress_percent, completed_at)
      VALUES (${userId}, ${input.course_version_id},
              ${completed ? "completed" : "in_progress"},
              ${input.progress_percent},
              ${completed ? new Date().toISOString() : null})
      ON CONFLICT (user_id, course_version_id) DO UPDATE SET
        progress_percent = GREATEST(user_course_progress.progress_percent, ${input.progress_percent}),
        status = CASE WHEN user_course_progress.status = 'completed' THEN 'completed'
                      ELSE ${completed ? "completed" : "in_progress"} END,
        completed_at = COALESCE(user_course_progress.completed_at, ${completed ? new Date().toISOString() : null})
      RETURNING id
    `) as Array<{ id: string }>;

    if (input.slide_id) {
      await sql`
        INSERT INTO user_slide_progress (user_progress_id, slide_id, viewed, completed, seconds_spent)
        VALUES (${progress.id}, ${input.slide_id}, true, ${completed}, ${input.seconds_spent ?? 0})
        ON CONFLICT (user_progress_id, slide_id) DO UPDATE SET
          viewed = true,
          completed = user_slide_progress.completed OR ${completed},
          seconds_spent = user_slide_progress.seconds_spent + ${input.seconds_spent ?? 0}
      `;
    }

    // Finishing a REQUIRED course counts toward overall training completion
    // exactly like a passed legacy module — see lib/trainingCompletion.ts.
    if (completed) {
      const cleanerId = await getCleanerId(sql, userId);
      if (cleanerId) await recomputeTrainingCompletion(sql, cleanerId, userId);
    }

    return c.json({ ok: true });
  }
);

/**
 * Grade one interactive block server-side and record the verdict. The
 * response shapes per block type are documented in the MCP design guide;
 * grading + feedback come from the FULL stored props, which the learner
 * never receives.
 */
coursesRouter.post(
  "/:id/respond",
  zValidator("json", z.object({
    course_version_id: z.string().uuid(),
    block_id: z.string().uuid(),
    response: z.record(z.unknown()),
    locale: z.string().max(10).optional(),
  })),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const userId = c.get("user").clerkId;

    // Only the live published version grades — a draft or an old version 404s.
    const [course] = (await sql`
      SELECT current_version_id, default_locale, supported_locales
      FROM courses WHERE id = ${id} AND status = 'published' LIMIT 1
    `) as Array<{ current_version_id: string | null; default_locale: string; supported_locales: unknown }>;
    if (!course || course.current_version_id !== input.course_version_id) {
      return c.json({ error: "course_version_not_current" }, 409);
    }

    const [block] = (await sql`
      SELECT b.id, b.block_type, b.props
      FROM slide_blocks b
      JOIN course_slides s ON s.id = b.slide_id
      WHERE b.id = ${input.block_id} AND s.course_version_id = ${input.course_version_id}
      LIMIT 1
    `) as Array<{ id: string; block_type: string; props: Record<string, unknown> }>;
    if (!block) return c.json({ error: "block_not_found" }, 404);
    if (!isCourseGradableBlockType(block.block_type)) {
      return c.json({ error: "block_not_interactive" }, 400);
    }

    const locale = effectiveLocale(input.locale, course.default_locale ?? "en", course.supported_locales);
    const props = localizeCourseBlockProps(block.props ?? {}, locale);
    const grade = gradeCourseBlock(block.block_type, props, input.response, block.id);
    if (!grade) return c.json({ error: "invalid_response_shape" }, 400);

    // Attach the verdict to the learner's current attempt.
    await sql`
      INSERT INTO user_course_progress (user_id, course_version_id, status, progress_percent)
      VALUES (${userId}, ${input.course_version_id}, 'in_progress', 0)
      ON CONFLICT (user_id, course_version_id) DO NOTHING
    `;
    const [progress] = (await sql`
      SELECT attempt FROM user_course_progress
      WHERE user_id = ${userId} AND course_version_id = ${input.course_version_id} LIMIT 1
    `) as Array<{ attempt: number }>;
    const attempt = progress?.attempt ?? 1;

    await sql`
      INSERT INTO course_interaction_responses
        (user_id, course_version_id, block_id, attempt, response, is_correct, score_pct)
      VALUES (${userId}, ${input.course_version_id}, ${block.id}, ${attempt},
              ${JSON.stringify(input.response)}::jsonb, ${grade.correct}, ${grade.scorePct})
      ON CONFLICT (user_id, course_version_id, block_id, attempt) DO UPDATE SET
        response = ${JSON.stringify(input.response)}::jsonb,
        is_correct = ${grade.correct},
        score_pct = ${grade.scorePct},
        updated_at = now()
    `;

    const [version] = (await sql`
      SELECT settings FROM course_versions WHERE id = ${input.course_version_id} LIMIT 1
    `) as Array<{ settings: unknown }>;
    const settings = versionSettings(version?.settings);

    const allowRetry = props.allowRetry !== false;
    const { feedback, explanation } = courseFeedbackFor(props, grade.correct);
    return c.json({
      correct: grade.correct,
      scorePct: grade.scorePct,
      feedback,
      explanation: settings.showExplanations === false ? null : explanation,
      detail: grade.detail ?? null,
      canRetry: allowRetry && !grade.correct,
      attempt,
    });
  }
);

/**
 * Finish an attempt. For a pass/fail course (settings.passingScorePct) this
 * is the ONLY way to complete: the server scores the attempt over every
 * gradeable block and applies maxAttempts/retake rules. For a course with no
 * pass mark it simply completes (equivalent to the legacy progress path).
 */
coursesRouter.post(
  "/:id/finish",
  zValidator("json", z.object({ course_version_id: z.string().uuid() })),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const userId = c.get("user").clerkId;

    const [course] = (await sql`
      SELECT current_version_id FROM courses WHERE id = ${id} AND status = 'published' LIMIT 1
    `) as Array<{ current_version_id: string | null }>;
    if (!course || course.current_version_id !== input.course_version_id) {
      return c.json({ error: "course_version_not_current" }, 409);
    }

    const [version] = (await sql`
      SELECT settings FROM course_versions WHERE id = ${input.course_version_id} LIMIT 1
    `) as Array<{ settings: unknown }>;
    const settings = versionSettings(version?.settings);

    const gradeable = (await sql`
      SELECT b.id FROM slide_blocks b
      JOIN course_slides s ON s.id = b.slide_id
      WHERE s.course_version_id = ${input.course_version_id}
        AND b.block_type = ANY(${[...COURSE_GRADABLE_BLOCK_TYPES]})
    `) as Array<{ id: string }>;

    await sql`
      INSERT INTO user_course_progress (user_id, course_version_id, status, progress_percent)
      VALUES (${userId}, ${input.course_version_id}, 'in_progress', 0)
      ON CONFLICT (user_id, course_version_id) DO NOTHING
    `;
    const [progress] = (await sql`
      SELECT id, attempt FROM user_course_progress
      WHERE user_id = ${userId} AND course_version_id = ${input.course_version_id} LIMIT 1
    `) as Array<{ id: string; attempt: number }>;
    const attempt = progress?.attempt ?? 1;

    const responses = (await sql`
      SELECT block_id, is_correct FROM course_interaction_responses
      WHERE user_id = ${userId} AND course_version_id = ${input.course_version_id} AND attempt = ${attempt}
    `) as Array<{ block_id: string; is_correct: boolean }>;
    const byBlock = new Map(responses.map((r) => [r.block_id, r.is_correct]));
    const totalCount = gradeable.length;
    const correctCount = gradeable.filter((g) => byBlock.get(g.id) === true).length;
    const scorePct = totalCount === 0 ? 100 : Math.round((correctCount / totalCount) * 100);

    const passMark = settings.passingScorePct;
    const isAssessed = passMark !== undefined && passMark !== null;
    const passed = !isAssessed || scorePct >= (passMark as number);

    if (passed) {
      await sql`
        UPDATE user_course_progress SET
          status = 'completed', progress_percent = 100,
          completed_at = COALESCE(completed_at, now()),
          last_score_pct = ${scorePct},
          best_score_pct = GREATEST(COALESCE(best_score_pct, 0), ${scorePct})
        WHERE id = ${progress.id}
      `;
      const cleanerId = await getCleanerId(sql, userId);
      if (cleanerId) await recomputeTrainingCompletion(sql, cleanerId, userId);
      return c.json({
        passed: true,
        scorePct: settings.showScore === false ? null : scorePct,
        correctCount,
        totalCount,
        attempt,
        attemptsLeft: null,
      });
    }

    const max = settings.maxAttempts ?? null;
    const attemptsLeft = max === null ? null : Math.max(0, max - attempt);
    if (attemptsLeft === null || attemptsLeft > 0) {
      // Open the next attempt: new answers land under attempt+1.
      await sql`
        UPDATE user_course_progress SET
          status = 'in_progress', attempt = ${attempt + 1},
          last_score_pct = ${scorePct},
          best_score_pct = GREATEST(COALESCE(best_score_pct, 0), ${scorePct})
        WHERE id = ${progress.id}
      `;
    } else {
      await sql`
        UPDATE user_course_progress SET
          status = 'failed',
          last_score_pct = ${scorePct},
          best_score_pct = GREATEST(COALESCE(best_score_pct, 0), ${scorePct})
        WHERE id = ${progress.id}
      `;
    }
    return c.json({
      passed: false,
      scorePct: settings.showScore === false ? null : scorePct,
      correctCount,
      totalCount,
      attempt,
      attemptsLeft,
    });
  }
);
