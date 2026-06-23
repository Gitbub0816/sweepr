-- Training modules (base + service-specific)
CREATE TABLE IF NOT EXISTS training_modules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  required_type TEXT NOT NULL CHECK (required_type IN ('base', 'service_specific', 'optional')),
  service_key TEXT,
  estimated_minutes INT,
  active BOOL DEFAULT true,
  version INT DEFAULT 1,
  sort_order INT DEFAULT 0,
  requires_quiz BOOL DEFAULT true,
  passing_score INT DEFAULT 80,
  max_attempts INT DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lessons within a module
CREATE TABLE IF NOT EXISTS training_lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id UUID NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  video_url TEXT,
  image_url TEXT,
  sort_order INT DEFAULT 0,
  estimated_minutes INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quiz questions for a module
CREATE TABLE IF NOT EXISTS training_quiz_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id UUID NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'multiple_choice',
  choices JSONB NOT NULL DEFAULT '[]',
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  sort_order INT DEFAULT 0
);

-- Cleaner progress per module
CREATE TABLE IF NOT EXISTS cleaner_training_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cleaner_id UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  module_version INT DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'passed', 'failed', 'review_required')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_lesson_id UUID REFERENCES training_lessons(id),
  score INT,
  attempt_count INT DEFAULT 0,
  required_for_activation BOOL DEFAULT true,
  UNIQUE(cleaner_id, module_id)
);

-- Individual quiz attempt records
CREATE TABLE IF NOT EXISTS cleaner_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cleaner_id UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  score INT,
  passed BOOL,
  answers JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_training_lessons_module ON training_lessons(module_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_training_quiz_questions_module ON training_quiz_questions(module_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cleaner_training_progress_cleaner ON cleaner_training_progress(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_quiz_attempts_cleaner ON cleaner_quiz_attempts(cleaner_id, module_id);

-- Add training columns to cleaners
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS training_status TEXT DEFAULT 'not_started';
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS training_completed_at TIMESTAMPTZ;
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS required_training_completed BOOL DEFAULT false;
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS background_check_unlocked BOOL DEFAULT false;

-- Drop old status constraint and add comprehensive one
ALTER TABLE cleaners DROP CONSTRAINT IF EXISTS cleaners_status_check;
ALTER TABLE cleaners ADD CONSTRAINT cleaners_status_check CHECK (status IN (
  'draft',
  'profile_incomplete',
  'identity_pending',
  'training_required',
  'training_in_progress',
  'training_failed',
  'training_completed',
  'background_check_available',
  'background_check_pending',
  'background_check_passed',
  'background_check_failed',
  'pending_activation',
  'active',
  'paused',
  'rejected',
  -- legacy values kept for backward compat during migration
  'pending',
  'approved',
  'suspended'
));
