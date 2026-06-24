-- ============================================================================
-- Course Builder (next-generation, PowerPoint-style training authoring)
--
-- This is a NEW system that lives alongside the existing module-based training
-- library (007_training_system.sql). The old training_modules/lessons/quizzes
-- remain the certification of record until a course here is published to
-- replace them. Nothing in this migration touches the existing tables.
--
-- Hierarchy:  courses → course_versions → course_slides → slide_blocks
--             (quiz blocks) → course_quiz_questions → course_quiz_answers
--             learner progress: user_course_progress → user_slide_progress
-- ============================================================================

-- Master course record (mutable metadata; content lives in versions).
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  required BOOLEAN DEFAULT true,
  -- Optional link to a legacy module this course is intended to replace.
  replaces_module_id UUID REFERENCES training_modules(id) ON DELETE SET NULL,
  current_version_id UUID,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- A version is a snapshot of course content. Drafts are editable; once
-- published they are immutable and learners are bound to a specific version.
CREATE TABLE IF NOT EXISTS course_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  require_retake BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  published_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (course_id, version_number)
);

-- Slides belong to a version.
CREATE TABLE IF NOT EXISTS course_slides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_version_id UUID NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
  title TEXT,
  slide_type TEXT DEFAULT 'content',
  slide_order INTEGER NOT NULL DEFAULT 0,
  background JSONB DEFAULT '{}'::jsonb,
  completion_rule JSONB DEFAULT '{"type":"viewed"}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Blocks are positioned PowerPoint-style objects on a slide.
CREATE TABLE IF NOT EXISTS slide_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slide_id UUID NOT NULL REFERENCES course_slides(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL CHECK (block_type IN (
    'text', 'image', 'video', 'quiz', 'button', 'checklist', 'acknowledgment'
  )),
  x NUMERIC NOT NULL DEFAULT 8,
  y NUMERIC NOT NULL DEFAULT 8,
  width NUMERIC NOT NULL DEFAULT 84,
  height NUMERIC NOT NULL DEFAULT 20,
  z_index INTEGER NOT NULL DEFAULT 0,
  props JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Quiz questions belong to a quiz block.
CREATE TABLE IF NOT EXISTS course_quiz_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  block_id UUID NOT NULL REFERENCES slide_blocks(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'multiple_choice' CHECK (question_type IN (
    'multiple_choice', 'multi_select', 'true_false', 'image_choice', 'short_answer'
  )),
  required BOOLEAN DEFAULT true,
  points INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS course_quiz_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES course_quiz_questions(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0
);

-- Learner progress, bound to a specific published version.
CREATE TABLE IF NOT EXISTS user_course_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  course_version_id UUID NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
  progress_percent INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, course_version_id)
);

CREATE TABLE IF NOT EXISTS user_slide_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_progress_id UUID NOT NULL REFERENCES user_course_progress(id) ON DELETE CASCADE,
  slide_id UUID NOT NULL REFERENCES course_slides(id) ON DELETE CASCADE,
  viewed BOOLEAN DEFAULT false,
  completed BOOLEAN DEFAULT false,
  seconds_spent INTEGER DEFAULT 0,
  UNIQUE (user_progress_id, slide_id)
);

-- FK from courses.current_version_id added after course_versions exists.
ALTER TABLE courses
  DROP CONSTRAINT IF EXISTS courses_current_version_fk;
ALTER TABLE courses
  ADD CONSTRAINT courses_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES course_versions(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_course_versions_course ON course_versions(course_id, version_number);
CREATE INDEX IF NOT EXISTS idx_course_slides_version ON course_slides(course_version_id, slide_order);
CREATE INDEX IF NOT EXISTS idx_slide_blocks_slide ON slide_blocks(slide_id, z_index);
CREATE INDEX IF NOT EXISTS idx_course_quiz_questions_block ON course_quiz_questions(block_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_course_quiz_answers_question ON course_quiz_answers(question_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_user_course_progress_user ON user_course_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_slide_progress_progress ON user_slide_progress(user_progress_id);
