/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- 111_course_interactive_blocks.sql
-- Course Builder v2 grows a real interactive layer (see
-- packages/utils/src/courseSchema.ts, the single source of truth for block
-- shapes):
--   1. Widen slide_blocks.block_type for the new native interactive blocks.
--   2. Locale support: one course, multiple locales — courses carry
--      default_locale/supported_locales plus an i18n JSONB overlay for
--      title/description; slides carry an i18n overlay for their title.
--      Block-level translations live INSIDE slide_blocks.props.i18n (the
--      props schema validates them), so no block column is needed.
--   3. Assessment settings per course version (passingScorePct, maxAttempts,
--      shuffleQuestions, shuffleAnswers, showScore, showExplanations) in
--      course_versions.settings.
--   4. course_interaction_responses: the server-graded record of every
--      learner answer (grading happens in the API from the stored props —
--      the learner payload has correct answers stripped).
--   5. user_course_progress learns attempts + scores for pass/fail courses.
-- Idempotent.

ALTER TABLE slide_blocks DROP CONSTRAINT IF EXISTS slide_blocks_block_type_check;

ALTER TABLE slide_blocks ADD CONSTRAINT slide_blocks_block_type_check
  CHECK (block_type IN (
    -- content
    'text', 'heading', 'image', 'video', 'embed',
    -- layout / decoration
    'shape', 'divider', 'spacer', 'callout',
    -- interactive / course-specific
    'quiz', 'button', 'checklist', 'acknowledgment',
    -- interactive v2 (migration 111)
    'true_false', 'image_choice', 'sort', 'order', 'matching',
    'hotspot', 'scenario', 'before_after', 'timeline'
  ));

ALTER TABLE courses ADD COLUMN IF NOT EXISTS default_locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS supported_locales TEXT[] NOT NULL DEFAULT ARRAY['en'];
ALTER TABLE courses ADD COLUMN IF NOT EXISTS i18n JSONB NOT NULL DEFAULT '{}';

ALTER TABLE course_slides ADD COLUMN IF NOT EXISTS i18n JSONB NOT NULL DEFAULT '{}';

ALTER TABLE course_versions ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

ALTER TABLE user_course_progress ADD COLUMN IF NOT EXISTS attempt INT NOT NULL DEFAULT 1;
ALTER TABLE user_course_progress ADD COLUMN IF NOT EXISTS last_score_pct NUMERIC;
ALTER TABLE user_course_progress ADD COLUMN IF NOT EXISTS best_score_pct NUMERIC;

-- One graded record per learner per block per attempt; re-answering within an
-- attempt overwrites (allowRetry), so "latest answer this attempt" is just
-- the row itself.
CREATE TABLE IF NOT EXISTS course_interaction_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                -- Clerk id, mirrors user_course_progress
  course_version_id UUID NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
  block_id UUID NOT NULL REFERENCES slide_blocks(id) ON DELETE CASCADE,
  attempt INT NOT NULL DEFAULT 1,
  response JSONB NOT NULL DEFAULT '{}',
  is_correct BOOLEAN NOT NULL DEFAULT false,
  score_pct NUMERIC,                    -- partial credit (quiz % correct)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_version_id, block_id, attempt)
);

CREATE INDEX IF NOT EXISTS idx_cir_user_version
  ON course_interaction_responses (user_id, course_version_id, attempt);
