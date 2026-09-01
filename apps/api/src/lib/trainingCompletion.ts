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
 * Shared training-completion accounting across the two training systems that
 * currently coexist: legacy training_modules (migration 007) and the Course
 * Builder v2 courses (migration 011, routes/courses.ts). A required,
 * published v2 course counts exactly like a required legacy module toward
 * "has this cleaner finished everything required" — this is what makes
 * @sweepr/db's syncLegacyModuleCutover meaningful: once a course takes over
 * a module's slot, completing that course is what's actually required, not
 * just a card that stopped appearing in a gating check nobody updated.
 *
 * cleaner_training_progress keys on cleaner_id; user_course_progress keys on
 * the raw Clerk id (courses are a general "learner" concept, not specific to
 * cleaners) — callers need both ids.
 */
import type { Sql } from "./db";

export interface RequiredCourseStatus {
  id: string;
  title: string;
  status: "not_started" | "in_progress" | "completed";
}

export interface TrainingRequirementCounts {
  totalRequired: number;
  totalPassed: number;
  requiredCourses: RequiredCourseStatus[];
}

/** Combined required/passed counts: active legacy base modules + published,
 *  required v2 courses. */
export async function getTrainingRequirementCounts(
  sql: Sql,
  cleanerId: string,
  clerkId: string,
): Promise<TrainingRequirementCounts> {
  const legacyRows = (await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE ctp.status = 'passed')::int AS passed
    FROM training_modules tm
    LEFT JOIN cleaner_training_progress ctp
      ON ctp.module_id = tm.id AND ctp.cleaner_id = ${cleanerId}
    WHERE tm.active = true AND tm.required_type = 'base'
  `) as Array<{ total: number; passed: number }>;
  const legacy = legacyRows[0] ?? { total: 0, passed: 0 };

  const courseRows = (await sql`
    SELECT c.id, c.title, ucp.status AS progress_status
    FROM courses c
    LEFT JOIN user_course_progress ucp
      ON ucp.course_version_id = c.current_version_id AND ucp.user_id = ${clerkId}
    WHERE c.status = 'published' AND c.required = true
  `) as Array<{ id: string; title: string; progress_status: string | null }>;

  const requiredCourses: RequiredCourseStatus[] = courseRows.map((r) => ({
    id: r.id,
    title: r.title,
    status:
      r.progress_status === "completed"
        ? "completed"
        : r.progress_status === "in_progress"
          ? "in_progress"
          : "not_started",
  }));
  const coursesPassed = requiredCourses.filter((r) => r.status === "completed").length;

  return {
    totalRequired: legacy.total + requiredCourses.length,
    totalPassed: legacy.passed + coursesPassed,
    requiredCourses,
  };
}

/**
 * Re-derive a cleaner's overall training-completion flags — call this after
 * a legacy quiz pass or a required v2 course completion. Only ever flips the
 * flags TRUE, matching the pre-existing legacy-only behavior: a later
 * content change (e.g. a v2 cutover raising the requirement) never
 * retroactively un-approves a cleaner already marked complete.
 */
export async function recomputeTrainingCompletion(
  sql: Sql,
  cleanerId: string,
  clerkId: string,
): Promise<{ allDone: boolean; totalRequired: number; totalPassed: number }> {
  const { totalRequired, totalPassed } = await getTrainingRequirementCounts(sql, cleanerId, clerkId);
  const allDone = totalRequired > 0 && totalPassed >= totalRequired;
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
  return { allDone, totalRequired, totalPassed };
}
