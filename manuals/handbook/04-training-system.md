# 04 · Training System

Sweepr runs a **fully native training platform** built directly into the
product. It is deliberately **not** SCORM-based and does **not** depend on
Moodle, TalentLMS, or any third-party LMS. It is purpose-built for onboarding and
certifying cleaners.

The system is designed to feel like a modern blend of **PowerPoint, Canva,
Notion, Loom, and Duolingo**, while staying fully integrated with Sweepr
accounts, cleaner profiles, job eligibility, and compliance requirements.

> **Two generations live side by side.** The current production training system
> (modules → lessons → quizzes) remains the **course library** and continues to
> certify cleaners. A new **PowerPoint-style Course Builder** is being introduced
> in Admin to author the next generation of courses; it can eventually overwrite
> library courses, but the existing courses remain in place until replaced.

---

## Part A — The current training library (in production)

The shipping system, defined in `packages/db/src/migrations/007_training_system.sql`,
is module-based:

```text
training_modules
  └── training_lessons          (title, body, video_url, image_url, order)
  └── training_quiz_questions   (question, type, choices, correct_answer)

cleaner_training_progress       (per cleaner × module: status, score, attempts)
cleaner_quiz_attempts           (each attempt: score, passed, answers)
```

**Module types** (`required_type`):
- `base` — required of every cleaner.
- `service_specific` — required only if the cleaner offers that `service_key`.
- `optional` — supplemental.

**Rules currently enforced:**
- Quizzes default to an **80% passing score** with up to **3 attempts**.
- Completing all required modules sets `required_training_completed = true` and
  unlocks the background check (`background_check_unlocked`).
- Progress is versioned by `module_version`, so a republished module can require
  a re-take.

Cleaners experience this in `apps/cleaner` (Training page); admins author it in
`apps/admin` (Training Admin). Seed content lives in migrations `008*`.

**These courses stay in the library.** They are the certification of record until
a replacement is published in the new builder.

---

## Part B — The next-generation Course Builder (PowerPoint-style)

### Design philosophy
The editor should look and behave like **PowerPoint**. Authors should understand
it instantly. **No code is ever required.** It should feel visual, creative,
modern, and premium. We explicitly avoid SCORM complexity, enterprise-LMS
clutter, technical forms, XML imports, and developer-focused workflows.

It departs visually from the rest of the app: the same brand colors, but a
denser, more technical, tool-like surface (toolbar, slide rail, canvas, inspector)
rather than the marketing-style layout used elsewhere in Admin.

### Editor layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Course Name   Undo Redo │ Add Slide │ Insert │ Theme │ Preview │ Publish │  ← Top toolbar
├───────────┬──────────────────────────────────────┬───────────┤
│  Slides   │                                      │  Inspector │
│  (thumbs) │            Center Canvas             │ (contextual│
│  reorder  │   drag · resize · snap · align       │  settings) │
│  dup/del  │   default: Mobile Portrait           │            │
└───────────┴──────────────────────────────────────┴───────────┘
```

- **Left rail** — slide thumbnails: number, preview, type, completion indicator;
  reorder, duplicate, delete, rename, multi-select.
- **Center canvas** — behaves like a slide: drag, resize, snap guides, alignment,
  layer controls, rich text. **Default editing mode is Mobile Portrait** because
  most cleaners train on phones.
- **Right inspector** — contextual settings based on selection (slide, text,
  image, video, quiz).

### Block types
Every slide is composed of positioned **blocks**:

| Block | Used for | Key props |
|-------|----------|-----------|
| **Text** | Titles, instructions, warnings | content, size, color, weight, align, bg, border |
| **Image** | Examples, before/after, safety | upload, crop, fit, caption, expand-on-click |
| **Video** | Demos, welcome, tutorials | Cloudflare Stream ID, captions, completion %, playback restrictions |
| **Quiz** | Assessment | multiple choice, multi-select, true/false, image choice, short answer; correct answers, passing score, retry rules, feedback |
| **Button** | Navigation / actions | next, previous, jump-to, open URL, complete course |
| **Checklist** | Procedural steps | items (e.g. "Take before photos", "Confirm arrival") |
| **Acknowledgment** | Policy sign-off | checkbox, typed name, initials, or signature |

### Data model

```text
Course → CourseVersion → Slide → Block
                              └── (quiz blocks) → Questions → Answers

User progress: user_course_progress → user_slide_progress
```

Core tables (target schema):

- `courses` — master record (title, description, category, status, required).
- `course_versions` — immutable published snapshots (`version_number`, `status`
  in `draft|published|archived`, `require_retake`).
- `course_slides` — slide definitions (title, slide_type, order, background,
  completion_rule).
- `slide_blocks` — PowerPoint-style objects (type, x, y, width, height, z_index,
  props JSONB).
- `quiz_questions` / `quiz_answers` — assessment content.
- `user_course_progress` / `user_slide_progress` — learner tracking.

Full DDL is the implementation reference for the builder migration; videos are
**never** stored in Postgres — only Cloudflare Stream references are.

### Completion rules
A slide/course can require any combination of:

```text
Viewed · Minimum time · Video completed · Video watch %
· Quiz passed · Checklist completed · Acknowledgment signed
```

Stored as JSON, e.g. `{ "type": "video_completed", "requiredPercent": 95 }`.

### Versioning rules
- Draft edits **never** affect active learners.
- Publishing creates a **new version** (immutable snapshot).
- Already-completed users **remain completed**.
- Admins may require **retakes** — but only when justified: major policy changes,
  safety content changes, or legal requirement changes.

### Assignment
Courses can be assigned to: everyone, new cleaners, existing cleaners, specific
markets, regions, or service tiers (e.g. "California cleaners", "New hires",
"Mop tier").

### Certificates
Course completion can optionally generate a **Certificate of Completion**,
stored in **Cloudflare R2** with metadata in Postgres.

### AI course generation (planned)
Admins will be able to generate a full course from a prompt
(e.g. _"Create a 10-slide course teaching cleaners how to take before/after
photos"_). The AI drafts slides, text, quiz questions, checklist items, and
suggested media. **An admin MUST review before publishing.**

### Storage & media
- **Cloudflare Stream** — training videos, captions, thumbnails, playback.
- **Cloudflare R2** — images, PDFs, downloads, attachments, certificates.
- **Neon Postgres** — all structural/relational data and media *references*.

### Recommended implementation stack
React · TypeScript · Tailwind · dnd-kit (drag) · Zustand (editor state) ·
TipTap (rich text) · React Hook Form · Hono on Cloudflare Workers · Neon.

### Roadmap
- **Phase 1 (MVP):** course list, editor (text/image/video/quiz blocks), preview,
  publish workflow, learner viewer, progress + completion tracking.
- **Phase 2:** AI generation, certificates, branching logic, scenario training,
  advanced analytics.
- **Phase 3:** course marketplace, shared templates, multi-language,
  automated recertification, compliance reporting.

---

[← Cleaner Lifecycle](./03-cleaner-lifecycle.md) · [Back to index](./README.md) · [Next: Day-of-Service →](./05-day-of-service.md)
