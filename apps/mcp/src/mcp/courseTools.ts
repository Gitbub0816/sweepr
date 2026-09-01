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
import { verifyAdminForCourses } from "../lib/adminAuth";
import { ToolError, type ToolContext } from "./toolContext";
import type { ToolDef } from "./tools";

export const COURSE_TOOL_NAMES = [
  "list_courses",
  "get_course",
  "save_course_draft",
  "preview_course",
  "publish_course",
] as const;

// ── zod schema (mirrors apps/api/src/routes/admin/courses.ts field-for-field) ──

const BLOCK_TYPES = [
  "text", "heading", "image", "video", "embed",
  "shape", "divider", "spacer", "callout",
  "quiz", "button", "checklist", "acknowledgment",
] as const;

const blockSchema = z.object({
  id: z.string().uuid().optional(),
  block_type: z.enum(BLOCK_TYPES),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  z_index: z.number().int().default(0),
  props: z.record(z.unknown()).default({}),
});

const slideSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().nullable().optional(),
  slide_type: z.string().default("content"),
  slide_order: z.number().int(),
  background: z.record(z.unknown()).default({}),
  completion_rule: z.record(z.unknown()).default({ type: "viewed" }),
  blocks: z.array(blockSchema).max(100).default([]),
});

const saveArgsSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  required: z.boolean().optional(),
  // Only meaningful (and only accepted) on CREATE — same as the admin
  // console, which has no way to change it after the fact either.
  replaces_module_id: z.string().uuid().nullable().optional(),
  // Omit entirely to update metadata only, without touching slides.
  slides: z.array(slideSchema).max(200).optional(),
});

// ── Tool definitions ─────────────────────────────────────────────────────

const slidesArgDescription =
  "Full slide list (wholesale replace — matches the admin editor's own " +
  "autosave semantics): [{ id?, title?, slide_type?, slide_order, " +
  "background?, completion_rule?, blocks: [{ id?, block_type: 'text'|" +
  "'heading'|'image'|'video'|'embed'|'shape'|'divider'|'spacer'|'callout'|" +
  "'quiz'|'button'|'checklist'|'acknowledgment', x, y, width, height, " +
  "z_index?, props }] }]. x/y/width/height are percentages of a 16:9 " +
  "canvas (0-100). props is block-type-specific — see the " +
  "sweepr://courses-design-guide resource for the shape of every block " +
  "type's props before calling this with slides.";

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
      "READ-ONLY: fetch one course by id, including its slides and blocks. By default returns the editable DRAFT version (what get_course + save_course_draft round-trip on); pass published:true to instead see the currently LIVE version a cleaner is actually served — useful to compare what's live against what you're editing.",
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
        slides: { type: "array", description: slidesArgDescription },
      },
      additionalProperties: false,
    },
  },
  {
    name: "preview_course",
    description:
      "READ-ONLY / pure computation: summarize a course's DRAFT (default) or published slides — per-slide title, block-type counts, and for any quiz block its question count — without needing to read the raw slide/block JSON yourself. Flags any video block missing a streamId (Cloudflare Stream video must be uploaded through the admin console; this MCP surface cannot upload video).",
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
      const slides = version ? await fetchSlidesWithBlocks(ctx, version.id) : [];
      return { course, version, slides };
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
      return {
        course: { id: course.id, title: course.title, status: course.status, replacesModuleId: course.replaces_module_id },
        versionNumber: version.version_number,
        versionStatus: version.status,
        slideCount: slides.length,
        slides: describeSlides(slides),
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

        if (b.title !== undefined || b.description !== undefined || b.category !== undefined || b.required !== undefined) {
          await ctx.sql`
            UPDATE courses SET
              title = COALESCE(${b.title ?? null}, title),
              description = COALESCE(${b.description ?? null}, description),
              category = COALESCE(${b.category ?? null}, category),
              required = COALESCE(${b.required ?? null}, required),
              updated_at = now()
            WHERE id = ${b.id}
          `;
        }

        if (b.slides !== undefined) {
          const [version] = (await ctx.sql`
            SELECT id FROM course_versions WHERE course_id = ${b.id} AND status = 'draft'
            ORDER BY version_number DESC LIMIT 1
          `) as Array<{ id: string }>;
          if (!version) throw new ToolError("No editable draft version — this course may only have published versions.");

          await ctx.sql`DELETE FROM course_slides WHERE course_version_id = ${version.id}`;
          for (const slide of b.slides) {
            const [newSlide] = (await ctx.sql`
              INSERT INTO course_slides (course_version_id, title, slide_type, slide_order, background, completion_rule)
              VALUES (${version.id}, ${slide.title ?? null}, ${slide.slide_type}, ${slide.slide_order},
                      ${JSON.stringify(slide.background)}::jsonb, ${JSON.stringify(slide.completion_rule)}::jsonb)
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
        INSERT INTO courses (title, description, category, required, replaces_module_id, created_by)
        VALUES (${b.title}, ${b.description ?? null}, ${b.category ?? null},
                ${b.required ?? true}, ${b.replaces_module_id ?? null}, ${createdBy})
        RETURNING id
      `) as Array<{ id: string }>;
      const [version] = (await ctx.sql`
        INSERT INTO course_versions (course_id, version_number, status)
        VALUES (${course.id}, 1, 'draft')
        RETURNING id
      `) as Array<{ id: string }>;
      await ctx.sql`UPDATE courses SET current_version_id = ${version.id} WHERE id = ${course.id}`;

      if (b.slides && b.slides.length > 0) {
        for (const slide of b.slides) {
          const [newSlide] = (await ctx.sql`
            INSERT INTO course_slides (course_version_id, title, slide_type, slide_order, background, completion_rule)
            VALUES (${version.id}, ${slide.title ?? null}, ${slide.slide_type}, ${slide.slide_order},
                    ${JSON.stringify(slide.background)}::jsonb, ${JSON.stringify(slide.completion_rule)}::jsonb)
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
        INSERT INTO course_versions (course_id, version_number, status)
        VALUES (${id}, ${nextNumber}, 'draft')
        RETURNING id
      `) as Array<{ id: string }>;
      const slides = await fetchSlidesWithBlocks(ctx, draft.id);
      for (const s of slides) {
        const [ns] = (await ctx.sql`
          INSERT INTO course_slides (course_version_id, title, slide_type, slide_order, background, completion_rule)
          VALUES (${newDraft.id}, ${s.title}, ${s.slide_type}, ${s.slide_order},
                  ${JSON.stringify(s.background)}::jsonb, ${JSON.stringify(s.completion_rule)}::jsonb)
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

    default:
      throw new ToolError(`Unknown course tool: ${name}`);
  }
}
