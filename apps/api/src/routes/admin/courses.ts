/**
 * Admin course-builder routes (next-generation PowerPoint-style training).
 *
 * Lives alongside the legacy /admin/training routes. The editor autosaves the
 * whole draft version via PUT /:id/draft (delete + reinsert slides/blocks),
 * which keeps the client simple and the server state consistent.
 *
 * All routes require auth + admin role.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../../lib/db";
import { requireAuth } from "../../middleware/auth";
import type { AppBindings } from "../../types";

export const adminCoursesRouter = new Hono<AppBindings>();

adminCoursesRouter.use("*", requireAuth);
adminCoursesRouter.use("*", async (c, next) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

// ─── Schemas ────────────────────────────────────────────────────────────────

const blockSchema = z.object({
  id: z.string().uuid().optional(),
  block_type: z.enum([
    "text", "heading", "image", "video", "embed",
    "shape", "divider", "spacer", "callout",
    "quiz", "button", "checklist", "acknowledgment",
  ]),
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
  blocks: z.array(blockSchema).default([]),
});

const draftSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  required: z.boolean().optional(),
  slides: z.array(slideSchema),
});

// ─── List ─────────────────────────────────────────────────────────────────

/** List all courses plus the legacy module library (read-only reference). */
adminCoursesRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);

  const courses = await sql`
    SELECT c.id, c.title, c.description, c.category, c.status, c.required,
           c.replaces_module_id, c.created_at, c.updated_at,
           cv.version_number AS current_version_number
    FROM courses c
    LEFT JOIN course_versions cv ON cv.id = c.current_version_id
    ORDER BY c.updated_at DESC
  `;

  // Legacy library — existing modules remain until replaced by a published course.
  const legacyModules = await sql`
    SELECT m.id, m.title, m.description, m.category, m.required_type,
           m.active, m.version,
           (SELECT COUNT(*) FROM training_lessons l WHERE l.module_id = m.id) AS lesson_count
    FROM training_modules m
    ORDER BY m.sort_order ASC, m.title ASC
  `;

  return c.json({ courses, legacyModules });
});

// ─── Create ───────────────────────────────────────────────────────────────

adminCoursesRouter.post(
  "/",
  zValidator("json", z.object({
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    category: z.string().optional(),
    required: z.boolean().default(true),
    replaces_module_id: z.string().uuid().optional(),
  })),
  async (c) => {
    const input = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const createdBy = c.get("user").clerkId;

    const [course] = await sql`
      INSERT INTO courses (title, description, category, required, replaces_module_id, created_by)
      VALUES (${input.title}, ${input.description ?? null}, ${input.category ?? null},
              ${input.required}, ${input.replaces_module_id ?? null}, ${createdBy})
      RETURNING *
    ` as Array<{ id: string }>;

    const [version] = await sql`
      INSERT INTO course_versions (course_id, version_number, status)
      VALUES (${course.id}, 1, 'draft')
      RETURNING id
    ` as Array<{ id: string }>;

    await sql`UPDATE courses SET current_version_id = ${version.id} WHERE id = ${course.id}`;

    // Seed an empty first slide so the editor opens to something.
    await sql`
      INSERT INTO course_slides (course_version_id, title, slide_order)
      VALUES (${version.id}, 'Untitled slide', 0)
    `;

    return c.json({ id: course.id }, 201);
  }
);

// ─── Read (full editable draft) ─────────────────────────────────────────────

/** Returns the course + its latest DRAFT version with nested slides + blocks. */
adminCoursesRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);

  const [course] = await sql`SELECT * FROM courses WHERE id = ${id} LIMIT 1` as Array<Record<string, unknown>>;
  if (!course) return c.json({ error: "Not found" }, 404);

  // Prefer the latest draft; fall back to the latest version overall.
  const [version] = await sql`
    SELECT * FROM course_versions
    WHERE course_id = ${id}
    ORDER BY (status = 'draft') DESC, version_number DESC
    LIMIT 1
  ` as Array<{ id: string; version_number: number; status: string }>;

  const slides = version
    ? await sql`
        SELECT * FROM course_slides
        WHERE course_version_id = ${version.id}
        ORDER BY slide_order ASC
      ` as Array<{ id: string }>
    : [];

  const slideIds = slides.map((s) => s.id);
  const blocks = slideIds.length
    ? await sql`
        SELECT * FROM slide_blocks
        WHERE slide_id = ANY(${slideIds})
        ORDER BY z_index ASC
      ` as Array<{ slide_id: string }>
    : [];

  const slidesWithBlocks = slides.map((s) => ({
    ...s,
    blocks: blocks.filter((b) => b.slide_id === (s as { id: string }).id),
  }));

  return c.json({ course, version, slides: slidesWithBlocks });
});

// ─── Update metadata ────────────────────────────────────────────────────────

adminCoursesRouter.patch(
  "/:id",
  zValidator("json", z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    required: z.boolean().optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
  })),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    await sql`
      UPDATE courses SET
        title = COALESCE(${input.title ?? null}, title),
        description = COALESCE(${input.description ?? null}, description),
        category = COALESCE(${input.category ?? null}, category),
        required = COALESCE(${input.required ?? null}, required),
        status = COALESCE(${input.status ?? null}, status),
        updated_at = now()
      WHERE id = ${id}
    `;
    return c.json({ ok: true });
  }
);

adminCoursesRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);
  await sql`DELETE FROM courses WHERE id = ${id}`;
  return c.json({ ok: true });
});

// ─── Save whole draft (autosave) ────────────────────────────────────────────

/**
 * Replace the draft version's slides + blocks wholesale. Editing a published
 * version is rejected — publish creates a fresh draft to edit.
 */
adminCoursesRouter.put(
  "/:id/draft",
  zValidator("json", draftSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);

    const [version] = await sql`
      SELECT id, status FROM course_versions
      WHERE course_id = ${id} AND status = 'draft'
      ORDER BY version_number DESC LIMIT 1
    ` as Array<{ id: string; status: string }>;

    if (!version) return c.json({ error: "No editable draft version" }, 409);

    // Update course metadata if provided.
    if (input.title !== undefined || input.description !== undefined ||
        input.category !== undefined || input.required !== undefined) {
      await sql`
        UPDATE courses SET
          title = COALESCE(${input.title ?? null}, title),
          description = COALESCE(${input.description ?? null}, description),
          category = COALESCE(${input.category ?? null}, category),
          required = COALESCE(${input.required ?? null}, required),
          updated_at = now()
        WHERE id = ${id}
      `;
    }

    // Wipe and reinsert. ON DELETE CASCADE clears blocks + quiz rows.
    await sql`DELETE FROM course_slides WHERE course_version_id = ${version.id}`;

    for (const slide of input.slides) {
      const [newSlide] = await sql`
        INSERT INTO course_slides (course_version_id, title, slide_type, slide_order, background, completion_rule)
        VALUES (${version.id}, ${slide.title ?? null}, ${slide.slide_type},
                ${slide.slide_order}, ${JSON.stringify(slide.background)}::jsonb,
                ${JSON.stringify(slide.completion_rule)}::jsonb)
        RETURNING id
      ` as Array<{ id: string }>;

      for (const block of slide.blocks) {
        await sql`
          INSERT INTO slide_blocks (slide_id, block_type, x, y, width, height, z_index, props)
          VALUES (${newSlide.id}, ${block.block_type}, ${block.x}, ${block.y},
                  ${block.width}, ${block.height}, ${block.z_index},
                  ${JSON.stringify(block.props)}::jsonb)
        `;
      }
    }

    return c.json({ ok: true });
  }
);

// ─── Publish ────────────────────────────────────────────────────────────────

/**
 * Publish the current draft version, then clone it into a fresh draft so the
 * editor always has something editable. Completed learners are unaffected.
 */
adminCoursesRouter.post(
  "/:id/publish",
  zValidator("json", z.object({ require_retake: z.boolean().default(false) })),
  async (c) => {
    const id = c.req.param("id");
    const { require_retake } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const publishedBy = c.get("user").clerkId;

    const [draft] = await sql`
      SELECT id, version_number FROM course_versions
      WHERE course_id = ${id} AND status = 'draft'
      ORDER BY version_number DESC LIMIT 1
    ` as Array<{ id: string; version_number: number }>;
    if (!draft) return c.json({ error: "No draft to publish" }, 409);

    await sql`
      UPDATE course_versions
      SET status = 'published', published_at = now(), published_by = ${publishedBy},
          require_retake = ${require_retake}
      WHERE id = ${draft.id}
    `;
    await sql`
      UPDATE courses SET status = 'published', current_version_id = ${draft.id}, updated_at = now()
      WHERE id = ${id}
    `;

    // Clone published version into a new editable draft.
    const nextNumber = draft.version_number + 1;
    const [newDraft] = await sql`
      INSERT INTO course_versions (course_id, version_number, status)
      VALUES (${id}, ${nextNumber}, 'draft')
      RETURNING id
    ` as Array<{ id: string }>;

    const slides = await sql`
      SELECT * FROM course_slides WHERE course_version_id = ${draft.id} ORDER BY slide_order ASC
    ` as Array<{ id: string; title: string | null; slide_type: string; slide_order: number; background: unknown; completion_rule: unknown }>;

    for (const s of slides) {
      const [ns] = await sql`
        INSERT INTO course_slides (course_version_id, title, slide_type, slide_order, background, completion_rule)
        VALUES (${newDraft.id}, ${s.title}, ${s.slide_type}, ${s.slide_order},
                ${JSON.stringify(s.background)}::jsonb, ${JSON.stringify(s.completion_rule)}::jsonb)
        RETURNING id
      ` as Array<{ id: string }>;
      const blocks = await sql`SELECT * FROM slide_blocks WHERE slide_id = ${s.id}` as Array<{
        block_type: string; x: number; y: number; width: number; height: number; z_index: number; props: unknown;
      }>;
      for (const b of blocks) {
        await sql`
          INSERT INTO slide_blocks (slide_id, block_type, x, y, width, height, z_index, props)
          VALUES (${ns.id}, ${b.block_type}, ${b.x}, ${b.y}, ${b.width}, ${b.height}, ${b.z_index},
                  ${JSON.stringify(b.props)}::jsonb)
        `;
      }
    }

    return c.json({ ok: true, published_version: draft.version_number });
  }
);
