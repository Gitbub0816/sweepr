-- 015_course_block_types.sql
-- Widen the slide_blocks.block_type CHECK to support the richer, PowerPoint-style
-- course editor (headings, shapes, dividers, callouts, spacers).
-- Idempotent.

ALTER TABLE slide_blocks DROP CONSTRAINT IF EXISTS slide_blocks_block_type_check;

ALTER TABLE slide_blocks ADD CONSTRAINT slide_blocks_block_type_check
  CHECK (block_type IN (
    -- content
    'text', 'heading', 'image', 'video', 'embed',
    -- layout / decoration
    'shape', 'divider', 'spacer', 'callout',
    -- interactive / course-specific
    'quiz', 'button', 'checklist', 'acknowledgment'
  ));
