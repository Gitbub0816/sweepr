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
 * MCP course-builder tool surface — the SECOND deliberate exception to this
 * worker's "MCP never writes live data" rule (the first is promotions; see
 * promotionTools.ts, which explains the rule and says "not a template for
 * future MCP tools ... without the same explicit, human, product-level
 * decision." That decision was made again, directly, for training courses).
 *
 * "Course Builder" (migration 011: courses / course_versions / course_slides
 * / slide_blocks) is the next-generation, PowerPoint-style replacement for
 * the legacy training_modules library (migration 007) — see
 * apps/api/src/routes/admin/courses.ts, which this file's SQL mirrors, and
 * apps/cleaner/src/pages/CourseViewerPage.tsx, which is what a cleaner
 * actually sees.
 *
 *   - list_courses, get_course, preview_course — READ-ONLY / pure
 *     computation.
 *   - save_course_draft — WRITES, but only ever to a course's editable
 *     DRAFT version (course_versions.status='draft'). A draft is never
 *     served to a learner (coursesRouter in apps/api/src/routes/courses.ts
 *     only ever serves `courses.status='published'`), so this is exactly as
 *     inert as the promotions draft tool.
 *   - publish_course — THE EXCEPTION. Sets a course's current draft version
 *     to 'published' directly, no console step required. Guardrails, all
 *     enforced in code below, mirroring publish_promotion:
 *       1. Admin-authenticated: re-verifies the caller's CURRENT role from
 *          the database at call time (verifyAdminForCourses in adminAuth.ts)
 *          — not just the OAuth-time token claim every other tool trusts.
 *       2. Schema-validated: the same slide/block shape the admin console
 *          editor writes (mirrors admin/courses.ts's draftSchema
 *          field-for-field).
 *       3. Audited: writes an `admin_audit_log` entry (action
 *          `course.published_via_mcp`), the same table/shape
 *          apps/api/src/lib/audit.ts's `audit()` writes from the console.
 *       4. THE CUTOVER — the reason this feature exists: if the course
 *          names a legacy module it replaces (`replaces_module_id`,
 *          settable only at creation, same as the console), publishing
 *          deactivates that module (`training_modules.active = false`) in
 *          the SAME write. From that moment the legacy module stops being
 *          returned by every active-only training query — it "dies" for
 *          learners — and the published course counts toward required
 *          training in its place (see apps/api/src/lib/trainingCompletion.ts
 *          on the API side). Modules migrate ONE AT A TIME: publishing one
 *          course never touches any module but the one it names, and a
 *          legacy module with no course pointed at it is untouched
 *          indefinitely — nothing requires migrating all of them at once.
 *
 * apps/mcp is a separate deployable Worker from apps/api and does NOT
 * depend on @sweepr/db (a deliberate, pre-existing boundary — see this
 * file's own inline cutover SQL below and adminAuth.ts's docblock), so the
 * cutover logic here is a direct mirror of @sweepr/db's
 * `syncLegacyModuleCutover` (used by apps/api's admin routes) rather than a
 * shared import.
 *
 * KNOWN GAP, not this task's to close: a `quiz` block's questions live as
 * free-form JSON in `slide_blocks.props.questions` (there ARE unused
 * relational course_quiz_questions/course_quiz_answers tables from the
 * original migration, but neither the admin editor nor the learner player
 * ever reads or writes them — props JSON is the real, live shape). The
 * learner-facing player (CourseViewerPage.tsx's `LearnerBlock`) currently
 * renders a quiz block as an inert "N question(s)" placeholder — it is not
 * yet interactive, graded, or gating. A course with a quiz block still
 * "completes" the moment its learner reaches the last slide, exactly like
 * one with none. Building that out is a separate, larger task.
 */

import { z } from "zod";
import {
  COURSE_BLOCK_TYPES,
  COURSE_COMPLETION_RULE_TYPES,
  COURSE_LOCALES,
  COURSE_SLIDE_TYPES,
  courseLocalizableSpecs,
  courseTranslationGaps,
  describeCourseBlockProps,
  validateCourseAssessmentSettings,
  validateCourseBlockProps,
  type CourseBlockType,
} from "@sweepr/utils";
import { verifyAdminForCourses } from "../lib/adminAuth";
import { ToolError, type ToolContext } from "./toolContext";
import type { ToolDef } from "./tools";

export const COURSE_TOOL_NAMES = [
  "list_courses",
  "get_course",
  "save_course_draft",
  "preview_course",
  "publish_course",
  "upload_course_asset",
] as const;

// ── zod schema ──────────────────────────────────────────────────────────────
// Geometry mirrors apps/api/src/routes/admin/courses.ts field-for-field. The
// PROPS, though, are validated per block type against @sweepr/utils's
// courseSchema — the same table both renderers read — instead of the
// `Record<string, unknown>` the admin route still accepts. A prop key the
// renderers don't understand is rejected here rather than stored, because
// storing it means a block that renders blank (or, for the object-shaped
// checklist items this used to accept, a slide that crashes the player).

const blockSchema = z
  .object({
    id: z.string().uuid().optional(),
    block_type: z.enum(COURSE_BLOCK_TYPES),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    z_index: z.number().int().default(0),
    props: z.record(z.unknown()).default({}),
  })
  .superRefine((block, ctx) => {
    for (const message of validateCourseBlockProps(block.block_type, block.props)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ["props"] });
    }
  });

const localeEnum = z.enum(COURSE_LOCALES);

const slideSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().nullable().optional(),
  slide_type: z.enum(COURSE_SLIDE_TYPES).default("content"),
  slide_order: z.number().int(),
  background: z
    .object({ color: z.string().max(80).optional() })
    .strict()
    .default({}),
  completion_rule: z
    .object({ type: z.enum(COURSE_COMPLETION_RULE_TYPES) })
    .strict()
    .default({ type: "viewed" }),
  // Per-locale slide-title overlay: { "es": { "title": "…" } }. Block-level
  // translations live inside each block's props.i18n instead.
  i18n: z.record(localeEnum, z.object({ title: z.string().max(255).optional() }).strict()).default({}),
  blocks: z.array(blockSchema).max(100).default([]),
});

const assessmentSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  for (const message of validateCourseAssessmentSettings(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  }
});

const saveArgsSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(255).optional(),
    description: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    required: z.boolean().optional(),
    // Only meaningful (and only accepted) on CREATE — same as the admin
    // console, which has no way to change it after the fact either.
    replaces_module_id: z.string().uuid().nullable().optional(),
    // Localization: ONE course record, per-locale overlays. i18n here covers
    // the course title/description; slide titles via slides[].i18n; block
    // copy via each block's props.i18n.
    default_locale: localeEnum.optional(),
    supported_locales: z.array(localeEnum).min(1).max(COURSE_LOCALES.length).optional(),
    i18n: z
      .record(localeEnum, z.object({ title: z.string().max(255).optional(), description: z.string().optional() }).strict())
      .optional(),
    // Assessment settings for the DRAFT version (passingScorePct, maxAttempts,
    // shuffleQuestions, shuffleAnswers, showScore, showExplanations).
    assessment: assessmentSchema.optional(),
    // Omit entirely to update metadata only, without touching slides.
    slides: z.array(slideSchema).max(200).optional(),
  })
  .refine(
    (d) => !d.default_locale || !d.supported_locales || d.supported_locales.includes(d.default_locale),
    { message: "supported_locales must include default_locale" },
  );

// ── Tool definitions ─────────────────────────────────────────────────────

const slidesArgDescription =
  "Full slide list (wholesale replace — matches the admin editor's own " +
  "autosave semantics): [{ id?, title?, slide_type?: 'content'|'title'|" +
  "'section'|'assessment', slide_order, background?: {color?}, " +
  "completion_rule?: {type}, blocks: [{ id?, block_type, x, y, width, " +
  "height, z_index?, props }] }]. x/y/width/height are percentages of a " +
  "16:9 canvas (0-100). EVERY block type has its own fixed set of prop " +
  "keys, validated on write against the exact table both renderers read — " +
  "an unknown key (e.g. `text` on a text block, whose key is `content`) or " +
  "a wrong value type (e.g. checklist `items` as [{text}] rather than " +
  "[\"…\"]) is REJECTED, not stored. Read sweepr://courses-design-guide, " +
  "or round-trip get_course's output, for the exact per-type shape:\n" +
  describeCourseBlockProps();

export const COURSE_TOOL_DEFS: ToolDef[] = [
  {
    name: "list_courses",
    description:
      "READ-ONLY: list every course (id, title, status, required, replaces_module_id, current published version number) PLUS the legacy training_modules library for reference (id, title, category, active, lesson_count) — so you can see which legacy modules exist and still need a v2 replacement, and which are already replaced. Newest-updated course first.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_course",
    description:
      "READ-ONLY: fetch one course by id. Its `slides` come back in EXACTLY the shape save_course_draft's `slides` argument takes, so a course built by hand in the admin editor can be read here and passed straight back to save_course_draft — the reliable way to copy a known-good block structure. By default returns the editable DRAFT version; pass published:true to instead see the currently LIVE version a cleaner is served. Any stored block whose props don't match the schema (content saved before write validation existed) is listed under `propIssues` rather than silently returned as valid.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "courses.id (UUID)." },
        published: { type: "boolean", description: "true = fetch the live published version instead of the draft. Default false." },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "save_course_draft",
    description:
      "WRITE (draft-only): create a new course (omit id) or update an existing one's editable draft (pass id). Never served to a learner while the draft stays unpublished — coursesRouter only ever serves status='published' courses. Omit `slides` to update metadata only, without touching content; pass `slides` to wholesale-replace the draft's slide content (same semantics as the admin editor's autosave). `replaces_module_id` only takes effect on create — pass the id of a LEGACY training_modules row (see list_courses's legacyModules) this course is meant to replace; leave unset for a brand-new, standalone required module with no legacy counterpart.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Omit to create a new course; pass an existing course's id to update its draft." },
        title: { type: "string", description: "Required when creating." },
        description: { type: "string" },
        category: { type: "string" },
        required: { type: "boolean", description: "Whether this counts toward the cleaner's required-training total. Defaults true on create." },
        replaces_module_id: { type: "string", description: "CREATE ONLY: legacy training_modules.id this course will replace once published." },
        default_locale: { type: "string", description: "The locale the base content is written in. Default \"en\"." },
        supported_locales: {
          type: "array",
          description: `Locales this course offers (must include default_locale). One course record serves every locale — translations are OVERLAYS: course title/description here in \`i18n\`, slide titles in slides[].i18n, block copy in each block's props.i18n ({\"es\": {\"content\": \"…\"}} — only text props, structured props element-wise). Learner progress counts once regardless of language. Allowed: ${COURSE_LOCALES.join(", ")}.`,
        },
        i18n: { type: "object", description: "Course title/description translations: {\"es\": {\"title\": \"…\", \"description\": \"…\"}}." },
        assessment: {
          type: "object",
          description:
            "Assessment settings for the draft version: passingScorePct (1-100, null = not pass/fail), maxAttempts (null = unlimited), shuffleQuestions, shuffleAnswers, showScore, showExplanations. A course with passingScorePct set completes ONLY when the server-scored attempt passes; the learner player enforces retakes from these settings.",
        },
        slides: { type: "array", description: slidesArgDescription },
      },
      additionalProperties: false,
    },
  },
  {
    name: "upload_course_asset",
    description:
      "WRITE (asset storage): store an image in Sweepr's normal R2 asset storage and get back a stable public URL for image-bearing block props (image.url, image_choice options[].url, hotspot.url, before_after beforeUrl/afterUrl, scenario messages[].url). Pass the file as base64 (data_base64) OR give a public https source_url for the server to fetch. JPEG/PNG/WebP only, 10 MB max. The returned `url` is permanent — save it straight into block props.",
    inputSchema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Original filename — its extension names the stored object (e.g. bathroom-before.jpg)." },
        content_type: { type: "string", description: "image/jpeg, image/png or image/webp. Required with data_base64; inferred from the response for source_url." },
        data_base64: { type: "string", description: "The file bytes, base64-encoded (standard or URL-safe alphabet)." },
        source_url: { type: "string", description: "Alternative to data_base64: a public https URL the server fetches the image from." },
        course_id: { type: "string", description: "Optional courses.id to file the asset under (training/<course_id>/…); otherwise it lands in the shared training library prefix." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "preview_course",
    description:
      "READ-ONLY / pure computation: summarize a course's DRAFT (default) or published slides — per-slide title, block-type counts, and for any quiz block its question count — without reading the raw slide/block JSON yourself. Lints the whole course: blocks whose stored props fail schema validation (propIssues), image-bearing props with no URL yet and video blocks missing a streamId (assetIssues — upload images with upload_course_asset; video needs the admin editor), and, for every supported locale beyond the default, text still missing a translation (translationGaps).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        published: { type: "boolean", description: "Preview the live published version instead of the draft. Default false." },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "publish_course",
    description:
      "THE ONE DELIBERATE MCP WRITE THAT GOES LIVE — publishes an existing course's current draft (no admin console step required), then clones it forward into a fresh editable draft, exactly like the console's Publish button. Guardrails: re-verifies your CURRENT admin role from the database at call time, and writes an admin_audit_log entry (action course.published_via_mcp). THE CUTOVER: if this course has replaces_module_id set, the legacy module it names is deactivated in the SAME write — it stops appearing to cleaners, and this course counts in its place toward required training from then on. Requires an id — create the course first with save_course_draft.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "courses.id (UUID) of an EXISTING course with a draft to publish." },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────

interface CourseRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  required: boolean;
  replaces_module_id: string | null;
  current_version_id: string | null;
  default_locale: string;
  supported_locales: string[];
  i18n: unknown;
  created_at: string;
  updated_at: string;
}

interface VersionRow {
  id: string;
  course_id: string;
  version_number: number;
  status: string;
}

interface SlideRow {
  id: string;
  course_version_id: string;
  title: string | null;
  slide_type: string;
  slide_order: number;
  background: unknown;
  completion_rule: unknown;
  i18n: unknown;
}

interface BlockRow {
  id: string;
  slide_id: string;
  block_type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  props: Record<string, unknown>;
}

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
}

/** Mirrors apps/api/src/lib/audit.ts's audit()'s never-throw contract. */
async function writeAdminAudit(
  ctx: ToolContext,
  entry: { action: string; actorClerkId: string; targetId: string; metadata: Record<string, unknown> },
): Promise<void> {
  try {
    await ctx.sql`
      INSERT INTO admin_audit_log (action, actor_clerk_id, target_type, target_id, metadata, created_at)
      VALUES (${entry.action}, ${entry.actorClerkId}, 'course', ${entry.targetId},
              ${JSON.stringify(entry.metadata)}, ${new Date().toISOString()})
    `;
  } catch {
    // best-effort
  }
}

/** Mirrors @sweepr/db's syncLegacyModuleCutover (apps/api's version — this
 *  worker deliberately doesn't depend on @sweepr/db, see this file's
 *  header). Deactivates the legacy module the moment a course replacing it
 *  is published; reactivates it the moment none is. */
async function syncLegacyModuleCutover(ctx: ToolContext, legacyModuleId: string | null): Promise<void> {
  if (!legacyModuleId) return;
  await ctx.sql`
    UPDATE training_modules
    SET active = NOT EXISTS (
      SELECT 1 FROM courses
      WHERE replaces_module_id = ${legacyModuleId} AND status = 'published'
    ),
    updated_at = NOW()
    WHERE id = ${legacyModuleId}
  `;
}

async function fetchSlidesWithBlocks(
  ctx: ToolContext,
  versionId: string,
): Promise<Array<SlideRow & { blocks: BlockRow[] }>> {
  const slides = (await ctx.sql`
    SELECT * FROM course_slides WHERE course_version_id = ${versionId} ORDER BY slide_order ASC
  `) as SlideRow[];
  const slideIds = slides.map((s) => s.id);
  const blocks = slideIds.length
    ? ((await ctx.sql`
        SELECT * FROM slide_blocks WHERE slide_id = ANY(${slideIds}) ORDER BY z_index ASC
      `) as BlockRow[])
    : [];
  return slides.map((s) => ({ ...s, blocks: blocks.filter((b) => b.slide_id === s.id) }));
}

/**
 * Re-shape stored rows into EXACTLY the `slides` argument save_course_draft
 * takes, so get_course → save_course_draft is a clean round-trip: a course
 * assembled by hand in the admin editor can be read here and handed straight
 * back, which is the reliable way to copy a known-good block structure. Drops
 * only the DB-internal keys (course_version_id, slide_id) the save schema
 * has no field for.
 */
function toSaveShape(slides: Array<SlideRow & { blocks: BlockRow[] }>) {
  return slides.map((s) => ({
    id: s.id,
    title: s.title,
    slide_type: s.slide_type,
    slide_order: s.slide_order,
    background: s.background,
    completion_rule: s.completion_rule,
    i18n: s.i18n ?? {},
    blocks: s.blocks.map((b) => ({
      id: b.id,
      block_type: b.block_type,
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      z_index: b.z_index,
      props: b.props,
    })),
  }));
}

/**
 * Schema problems in blocks ALREADY stored. Content written before this tool
 * validated props can hold keys no renderer reads (renders blank) or values
 * of the wrong type (crashed the learner's slide, for object-shaped
 * checklist items). Surfacing them on read is how an author finds them.
 */
function collectPropIssues(slides: Array<SlideRow & { blocks: BlockRow[] }>) {
  const issues: Array<{ slideId: string; blockId: string; blockType: string; problems: string[] }> = [];
  for (const s of slides) {
    for (const b of s.blocks) {
      const problems = validateCourseBlockProps(b.block_type, b.props);
      if (problems.length) {
        issues.push({ slideId: s.id, blockId: b.id, blockType: b.block_type, problems });
      }
    }
  }
  return issues;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const rows = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? (v.filter(isObj) as Array<Record<string, unknown>>) : [];

/**
 * Image-bearing props still missing their upload (plus video blocks with no
 * streamId). These are LINT, not save-time errors — an author fills URLs in
 * as they upload assets.
 */
function collectAssetIssues(slides: Array<SlideRow & { blocks: BlockRow[] }>) {
  const issues: Array<{ slideId: string; blockId: string; blockType: string; problem: string }> = [];
  const flag = (s: SlideRow, b: BlockRow, problem: string) =>
    issues.push({ slideId: s.id, blockId: b.id, blockType: b.block_type, problem });
  for (const s of slides) {
    for (const b of s.blocks) {
      const p = b.props ?? {};
      switch (b.block_type) {
        case "image":
          if (!p.url) flag(s, b, "image block has no url — upload with upload_course_asset");
          break;
        case "hotspot":
          if (!p.url) flag(s, b, "hotspot block has no url — the learner needs an image to tap");
          break;
        case "image_choice":
          rows(p.options).forEach((o, i) => {
            if (!o.url) flag(s, b, `image_choice option ${i} has no url`);
          });
          break;
        case "before_after":
          if (!p.beforeUrl) flag(s, b, "before_after has no beforeUrl");
          if (!p.afterUrl) flag(s, b, "before_after has no afterUrl");
          break;
        case "video":
          if (!p.streamId) flag(s, b, "video block has no streamId (video uploads happen in the admin editor)");
          break;
      }
    }
  }
  return issues;
}

/**
 * For every supported locale beyond the default: which learner-visible text
 * still has no translation (course/slide titles + each block's localizable
 * props, via the shared spec table).
 */
function collectTranslationGaps(
  course: CourseRow,
  slides: Array<SlideRow & { blocks: BlockRow[] }>,
): Record<string, string[]> {
  const supported = Array.isArray(course.supported_locales) ? course.supported_locales : ["en"];
  const def = course.default_locale ?? "en";
  const out: Record<string, string[]> = {};
  for (const locale of supported.filter((l) => l !== def)) {
    const gaps: string[] = [];
    const ci = isObj(course.i18n) && isObj((course.i18n as Record<string, unknown>)[locale])
      ? ((course.i18n as Record<string, unknown>)[locale] as Record<string, unknown>)
      : {};
    if (course.title && typeof ci.title !== "string") gaps.push("course.title");
    if (course.description && typeof ci.description !== "string") gaps.push("course.description");
    for (const s of slides) {
      const si = isObj(s.i18n) && isObj((s.i18n as Record<string, unknown>)[locale])
        ? ((s.i18n as Record<string, unknown>)[locale] as Record<string, unknown>)
        : {};
      if (s.title && typeof si.title !== "string") gaps.push(`slide[${s.slide_order}].title`);
      for (const b of s.blocks) {
        if (!COURSE_BLOCK_TYPES.includes(b.block_type as CourseBlockType)) continue;
        const type = b.block_type as CourseBlockType;
        gaps.push(
          ...courseTranslationGaps(type, b.props ?? {}, locale, courseLocalizableSpecs(type)).map(
            (g) => `slide[${s.slide_order}].${g}`,
          ),
        );
      }
    }
    if (gaps.length) out[locale] = gaps;
  }
  return out;
}

/** The draft version to read/write: the latest status='draft' row, or (for
 *  reads only) the latest version overall if somehow none is a draft. */
async function resolveVersion(
  ctx: ToolContext,
  courseId: string,
  published: boolean,
): Promise<VersionRow | null> {
  if (published) {
    const [course] = (await ctx.sql`
      SELECT current_version_id FROM courses WHERE id = ${courseId} AND status = 'published' LIMIT 1
    `) as Array<{ current_version_id: string | null }>;
    if (!course?.current_version_id) return null;
    const [version] = (await ctx.sql`
      SELECT * FROM course_versions WHERE id = ${course.current_version_id} LIMIT 1
    `) as VersionRow[];
    return version ?? null;
  }
  const [version] = (await ctx.sql`
    SELECT * FROM course_versions
    WHERE course_id = ${courseId}
    ORDER BY (status = 'draft') DESC, version_number DESC
    LIMIT 1
  `) as VersionRow[];
  return version ?? null;
}

function describeSlides(slides: Array<SlideRow & { blocks: BlockRow[] }>) {
  return slides.map((s) => {
    const blockCounts: Record<string, number> = {};
    let videoMissingStream = 0;
    for (const b of s.blocks) {
      blockCounts[b.block_type] = (blockCounts[b.block_type] ?? 0) + 1;
      if (b.block_type === "video" && !b.props?.streamId) videoMissingStream++;
    }
    const quizzes = s.blocks
      .filter((b) => b.block_type === "quiz")
      .map((b) => ({ blockId: b.id, questionCount: Array.isArray(b.props?.questions) ? (b.props.questions as unknown[]).length : 0 }));
    return {
      id: s.id,
      title: s.title ?? "(untitled)",
      slideOrder: s.slide_order,
      blockCount: s.blocks.length,
      blockCounts,
      quizzes,
      ...(videoMissingStream > 0 ? { videoBlocksMissingUpload: videoMissingStream } : {}),
    };
  });
}

// ── Dispatch ──────────────────────────────────────────────────────────────

export async function callCourseTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "list_courses": {
      const courses = await ctx.sql`
        SELECT c.id, c.title, c.description, c.category, c.status, c.required,
               c.replaces_module_id, c.created_at, c.updated_at,
               cv.version_number AS current_version_number
        FROM courses c
        LEFT JOIN course_versions cv ON cv.id = c.current_version_id
        ORDER BY c.updated_at DESC
      `;
      const legacyModules = await ctx.sql`
        SELECT m.id, m.title, m.description, m.category, m.required_type, m.active, m.version,
               (SELECT COUNT(*) FROM training_lessons l WHERE l.module_id = m.id) AS lesson_count
        FROM training_modules m
        ORDER BY m.sort_order ASC, m.title ASC
      `;
      return { courses, legacyModules };
    }

    case "get_course": {
      const id = typeof args.id === "string" ? args.id : undefined;
      if (!id) throw new ToolError("Pass id.");
      const published = args.published === true;
      const [course] = (await ctx.sql`SELECT * FROM courses WHERE id = ${id} LIMIT 1`) as CourseRow[];
      if (!course) throw new ToolError("No course with that id.");
      const version = await resolveVersion(ctx, id, published);
      const slideRows = version ? await fetchSlidesWithBlocks(ctx, version.id) : [];
      const propIssues = collectPropIssues(slideRows);
      const [versionSettings] = version
        ? ((await ctx.sql`SELECT settings FROM course_versions WHERE id = ${version.id} LIMIT 1`) as Array<{ settings: unknown }>)
        : [];
      return {
        course,
        version,
        // Round-trips into save_course_draft's `assessment` argument.
        assessment: versionSettings?.settings ?? {},
        // Exactly save_course_draft's `slides` shape — pass it straight back.
        slides: toSaveShape(slideRows),
        propIssues,
        ...(propIssues.length
          ? {
              note:
                "Some stored blocks have props that fail schema validation (see propIssues). They were saved before this tool validated props; fix them and save_course_draft will accept the corrected slides.",
            }
          : {}),
      };
    }

    case "preview_course": {
      const id = typeof args.id === "string" ? args.id : undefined;
      if (!id) throw new ToolError("Pass id.");
      const published = args.published === true;
      const [course] = (await ctx.sql`SELECT * FROM courses WHERE id = ${id} LIMIT 1`) as CourseRow[];
      if (!course) throw new ToolError("No course with that id.");
      const version = await resolveVersion(ctx, id, published);
      if (!version) return { course: { id: course.id, title: course.title }, slideCount: 0, slides: [] };
      const slides = await fetchSlidesWithBlocks(ctx, version.id);
      const propIssues = collectPropIssues(slides);
      const assetIssues = collectAssetIssues(slides);
      const translationGaps = collectTranslationGaps(course, slides);
      const [versionSettings] = (await ctx.sql`
        SELECT settings FROM course_versions WHERE id = ${version.id} LIMIT 1
      `) as Array<{ settings: unknown }>;
      return {
        course: {
          id: course.id,
          title: course.title,
          status: course.status,
          replacesModuleId: course.replaces_module_id,
          defaultLocale: course.default_locale,
          supportedLocales: course.supported_locales,
        },
        versionNumber: version.version_number,
        versionStatus: version.status,
        assessment: versionSettings?.settings ?? {},
        slideCount: slides.length,
        slides: describeSlides(slides),
        propIssues,
        assetIssues,
        translationGaps,
      };
    }

    case "save_course_draft": {
      const parsed = saveArgsSchema.safeParse(args);
      if (!parsed.success) throw new ToolError(zodMessage(parsed.error));
      const b = parsed.data;

      const verdict = await verifyAdminForCourses(ctx.env, ctx.sql, ctx.adminEmail);
      if (!verdict.ok) throw new ToolError(`Not authorized to write courses (${verdict.reason}).`);

      if (b.id) {
        const [existing] = (await ctx.sql`SELECT id FROM courses WHERE id = ${b.id} LIMIT 1`) as Array<{ id: string }>;
        if (!existing) throw new ToolError("No course with that id.");

        if (b.title !== undefined || b.description !== undefined || b.category !== undefined || b.required !== undefined ||
            b.default_locale !== undefined || b.supported_locales !== undefined || b.i18n !== undefined) {
          await ctx.sql`
            UPDATE courses SET
              title = COALESCE(${b.title ?? null}, title),
              description = COALESCE(${b.description ?? null}, description),
              category = COALESCE(${b.category ?? null}, category),
              required = COALESCE(${b.required ?? null}, required),
              default_locale = COALESCE(${b.default_locale ?? null}, default_locale),
              supported_locales = COALESCE(${b.supported_locales ?? null}, supported_locales),
              i18n = COALESCE(${b.i18n ? JSON.stringify(b.i18n) : null}::jsonb, i18n),
              updated_at = now()
            WHERE id = ${b.id}
          `;
        }

        if (b.assessment !== undefined || b.slides !== undefined) {
          const [version] = (await ctx.sql`
            SELECT id FROM course_versions WHERE course_id = ${b.id} AND status = 'draft'
            ORDER BY version_number DESC LIMIT 1
          `) as Array<{ id: string }>;
          if (!version) throw new ToolError("No editable draft version — this course may only have published versions.");

          if (b.assessment !== undefined) {
            await ctx.sql`
              UPDATE course_versions SET settings = ${JSON.stringify(b.assessment)}::jsonb
              WHERE id = ${version.id}
            `;
          }

          if (b.slides !== undefined) {
            await ctx.sql`DELETE FROM course_slides WHERE course_version_id = ${version.id}`;
            for (const slide of b.slides) {
              const [newSlide] = (await ctx.sql`
                INSERT INTO course_slides (course_version_id, title, slide_type, slide_order, background, completion_rule, i18n)
                VALUES (${version.id}, ${slide.title ?? null}, ${slide.slide_type}, ${slide.slide_order},
                        ${JSON.stringify(slide.background)}::jsonb, ${JSON.stringify(slide.completion_rule)}::jsonb,
                        ${JSON.stringify(slide.i18n ?? {})}::jsonb)
                RETURNING id
              `) as Array<{ id: string }>;
              for (const block of slide.blocks) {
                await ctx.sql`
                  INSERT INTO slide_blocks (slide_id, block_type, x, y, width, height, z_index, props)
                  VALUES (${newSlide.id}, ${block.block_type}, ${block.x}, ${block.y},
                          ${block.width}, ${block.height}, ${block.z_index}, ${JSON.stringify(block.props)}::jsonb)
                `;
              }
            }
          }
        }

        await writeAdminAudit(ctx, {
          action: "course.updated",
          actorClerkId: verdict.admin.clerkId ?? `mcp:${verdict.admin.email}`,
          targetId: b.id,
          metadata: { via: "mcp", adminEmail: verdict.admin.email, slideCount: b.slides?.length },
        });
        const [course] = (await ctx.sql`SELECT * FROM courses WHERE id = ${b.id} LIMIT 1`) as CourseRow[];
        return { saved: true, course };
      }

      if (!b.title) throw new ToolError("title is required to create a course.");
      const createdBy = `mcp:${verdict.admin.email}`;
      const [course] = (await ctx.sql`
        INSERT INTO courses (title, description, category, required, replaces_module_id, created_by,
                             default_locale, supported_locales, i18n)
        VALUES (${b.title}, ${b.description ?? null}, ${b.category ?? null},
                ${b.required ?? true}, ${b.replaces_module_id ?? null}, ${createdBy},
                ${b.default_locale ?? "en"}, ${b.supported_locales ?? ["en"]},
                ${JSON.stringify(b.i18n ?? {})}::jsonb)
        RETURNING id
      `) as Array<{ id: string }>;
      const [version] = (await ctx.sql`
        INSERT INTO course_versions (course_id, version_number, status, settings)
        VALUES (${course.id}, 1, 'draft', ${JSON.stringify(b.assessment ?? {})}::jsonb)
        RETURNING id
      `) as Array<{ id: string }>;
      await ctx.sql`UPDATE courses SET current_version_id = ${version.id} WHERE id = ${course.id}`;

      if (b.slides && b.slides.length > 0) {
        for (const slide of b.slides) {
          const [newSlide] = (await ctx.sql`
            INSERT INTO course_slides (course_version_id, title, slide_type, slide_order, background, completion_rule, i18n)
            VALUES (${version.id}, ${slide.title ?? null}, ${slide.slide_type}, ${slide.slide_order},
                    ${JSON.stringify(slide.background)}::jsonb, ${JSON.stringify(slide.completion_rule)}::jsonb,
                    ${JSON.stringify(slide.i18n ?? {})}::jsonb)
            RETURNING id
          `) as Array<{ id: string }>;
          for (const block of slide.blocks) {
            await ctx.sql`
              INSERT INTO slide_blocks (slide_id, block_type, x, y, width, height, z_index, props)
              VALUES (${newSlide.id}, ${block.block_type}, ${block.x}, ${block.y},
                      ${block.width}, ${block.height}, ${block.z_index}, ${JSON.stringify(block.props)}::jsonb)
            `;
          }
        }
      } else {
        await ctx.sql`
          INSERT INTO course_slides (course_version_id, title, slide_order)
          VALUES (${version.id}, 'Untitled slide', 0)
        `;
      }

      await writeAdminAudit(ctx, {
        action: "course.created",
        actorClerkId: verdict.admin.clerkId ?? `mcp:${verdict.admin.email}`,
        targetId: course.id,
        metadata: { via: "mcp", adminEmail: verdict.admin.email, title: b.title },
      });
      const [full] = (await ctx.sql`SELECT * FROM courses WHERE id = ${course.id} LIMIT 1`) as CourseRow[];
      return { saved: true, course: full };
    }

    case "publish_course": {
      const id = typeof args.id === "string" ? args.id : undefined;
      if (!id) throw new ToolError("Pass id.");

      // Guardrail 1: re-verify the CURRENT admin role from the database —
      // not just the OAuth-session token every other tool call trusts.
      const verdict = await verifyAdminForCourses(ctx.env, ctx.sql, ctx.adminEmail);
      if (!verdict.ok) {
        throw new ToolError(
          `Not authorized to publish courses (${verdict.reason}). This is the one MCP tool that changes ` +
            "what a cleaner is actually required to complete, so it re-checks your admin role on every call.",
        );
      }

      const [course] = (await ctx.sql`SELECT * FROM courses WHERE id = ${id} LIMIT 1`) as CourseRow[];
      if (!course) throw new ToolError("No course with that id. Create one first with save_course_draft.");

      const [draft] = (await ctx.sql`
        SELECT id, version_number FROM course_versions
        WHERE course_id = ${id} AND status = 'draft'
        ORDER BY version_number DESC LIMIT 1
      `) as Array<{ id: string; version_number: number }>;
      if (!draft) throw new ToolError("No draft to publish.");

      const publishedBy = `mcp:${verdict.admin.email}`;
      await ctx.sql`
        UPDATE course_versions
        SET status = 'published', published_at = now(), published_by = ${publishedBy}
        WHERE id = ${draft.id}
      `;
      await ctx.sql`
        UPDATE courses SET status = 'published', current_version_id = ${draft.id}, updated_at = now()
        WHERE id = ${id}
      `;

      // Guardrail 4 — THE CUTOVER: this course now being 'published' is what
      // makes the legacy module it replaces (if any) stop being served.
      await syncLegacyModuleCutover(ctx, course.replaces_module_id);

      // Clone the just-published version forward into a fresh editable
      // draft, exactly like the admin console's Publish button.
      const nextNumber = draft.version_number + 1;
      const [newDraft] = (await ctx.sql`
        INSERT INTO course_versions (course_id, version_number, status, settings)
        VALUES (${id}, ${nextNumber}, 'draft',
                (SELECT settings FROM course_versions WHERE id = ${draft.id}))
        RETURNING id
      `) as Array<{ id: string }>;
      const slides = await fetchSlidesWithBlocks(ctx, draft.id);
      for (const s of slides) {
        const [ns] = (await ctx.sql`
          INSERT INTO course_slides (course_version_id, title, slide_type, slide_order, background, completion_rule, i18n)
          VALUES (${newDraft.id}, ${s.title}, ${s.slide_type}, ${s.slide_order},
                  ${JSON.stringify(s.background)}::jsonb, ${JSON.stringify(s.completion_rule)}::jsonb,
                  ${JSON.stringify(s.i18n ?? {})}::jsonb)
          RETURNING id
        `) as Array<{ id: string }>;
        for (const bl of s.blocks) {
          await ctx.sql`
            INSERT INTO slide_blocks (slide_id, block_type, x, y, width, height, z_index, props)
            VALUES (${ns.id}, ${bl.block_type}, ${bl.x}, ${bl.y}, ${bl.width}, ${bl.height}, ${bl.z_index},
                    ${JSON.stringify(bl.props)}::jsonb)
          `;
        }
      }

      await writeAdminAudit(ctx, {
        action: "course.published_via_mcp",
        actorClerkId: verdict.admin.clerkId ?? `mcp:${verdict.admin.email}`,
        targetId: id,
        metadata: {
          via: "mcp",
          adminEmail: verdict.admin.email,
          publishedVersion: draft.version_number,
          replacesModuleId: course.replaces_module_id,
          cutover: course.replaces_module_id !== null,
        },
      });

      return {
        published: true,
        publishedVersion: draft.version_number,
        cutover: course.replaces_module_id
          ? `Legacy module ${course.replaces_module_id} is now deactivated — this course replaces it.`
          : "No legacy module linked (replaces_module_id was not set) — nothing else changed.",
        guardrails:
          "Re-verified your admin role from the database and logged this to admin_audit_log " +
          "(course.published_via_mcp) alongside the standard MCP action log.",
      };
    }

    case "upload_course_asset": {
      // Same admin gate as the write tools — asset storage is a write.
      const verdict = await verifyAdminForCourses(ctx.env, ctx.sql, ctx.adminEmail);
      if (!verdict.ok) throw new ToolError(`Not authorized to upload course assets (${verdict.reason}).`);

      const bucket = ctx.env.COURSE_ASSETS;
      if (!bucket) {
        throw new ToolError(
          "Asset storage is not configured on this worker (COURSE_ASSETS R2 binding missing) — redeploy with the binding in wrangler.toml.",
        );
      }

      const filename = typeof args.filename === "string" ? args.filename : "";
      const declaredType = typeof args.content_type === "string" ? args.content_type.toLowerCase() : "";
      const dataB64 = typeof args.data_base64 === "string" ? args.data_base64 : "";
      const sourceUrl = typeof args.source_url === "string" ? args.source_url : "";
      const courseId = typeof args.course_id === "string" ? args.course_id : "";

      // Mirrors apps/api's /storage/sign-upload allowlist for scope "training".
      const ALLOWED: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      };
      const MAX_BYTES = 10 * 1024 * 1024;

      let bytes: Uint8Array;
      let contentType: string;
      if (dataB64) {
        if (!ALLOWED[declaredType]) {
          throw new ToolError(`content_type must be one of: ${Object.keys(ALLOWED).join(", ")}.`);
        }
        contentType = declaredType;
        const normalized = dataB64.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
        let binary: string;
        try {
          binary = atob(normalized);
        } catch {
          throw new ToolError("data_base64 is not valid base64.");
        }
        if (binary.length > MAX_BYTES) throw new ToolError("Image exceeds the 10 MB limit.");
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } else if (sourceUrl) {
        let parsed: URL;
        try {
          parsed = new URL(sourceUrl);
        } catch {
          throw new ToolError("source_url is not a valid URL.");
        }
        // Server-side fetch guard: public https hosts only — no plaintext,
        // no localhost/IP-literal targets for this worker to poke at.
        const host = parsed.hostname.toLowerCase();
        const isIpLiteral = /^[\d.]+$/.test(host) || host.includes(":");
        if (parsed.protocol !== "https:" || isIpLiteral || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
          throw new ToolError("source_url must be a public https URL.");
        }
        const res = await fetch(parsed.toString(), { redirect: "follow" });
        if (!res.ok) throw new ToolError(`Fetching source_url failed (${res.status}).`);
        contentType = (res.headers.get("content-type") ?? declaredType).split(";")[0].trim().toLowerCase();
        if (!ALLOWED[contentType]) {
          throw new ToolError(`source_url served "${contentType || "unknown"}" — must be one of: ${Object.keys(ALLOWED).join(", ")}.`);
        }
        const buf = await res.arrayBuffer();
        if (buf.byteLength > MAX_BYTES) throw new ToolError("Image exceeds the 10 MB limit.");
        bytes = new Uint8Array(buf);
      } else {
        throw new ToolError("Pass the file as data_base64 (with content_type) or a public https source_url.");
      }

      // Same training/ prefix apps/api uses for scope "training", so retention
      // and serving rules treat these like any other course asset.
      const ext = ALLOWED[contentType];
      const slug = filename
        .replace(/\.[A-Za-z0-9]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "asset";
      const folder = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(courseId)
        ? courseId
        : "mcp-library";
      const storageKey = `training/${folder}/${Date.now()}-${slug}.${ext}`;

      await bucket.put(storageKey, bytes, { httpMetadata: { contentType } });

      const publicBase = (ctx.env.R2_PUBLIC_URL ?? "https://objects.getsweepr.com").replace(/\/$/, "");
      const url = `${publicBase}/${storageKey}`;

      await writeAdminAudit(ctx, {
        action: "course.asset_uploaded_via_mcp",
        actorClerkId: verdict.admin.clerkId ?? `mcp:${verdict.admin.email}`,
        targetId: folder,
        metadata: { via: "mcp", adminEmail: verdict.admin.email, storageKey, contentType, bytes: bytes.length },
      });

      return {
        uploaded: true,
        url,
        storageKey,
        contentType,
        bytes: bytes.length,
        note: "Use `url` verbatim in image-bearing block props (image.url, image_choice options[].url, hotspot.url, before_after beforeUrl/afterUrl, scenario messages[].url).",
      };
    }

    default:
      throw new ToolError(`Unknown course tool: ${name}`);
  }
}
