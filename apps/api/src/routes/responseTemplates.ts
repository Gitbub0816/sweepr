/**
 * Editable canned response templates (used to pre-fill manual IT/Security replies).
 *
 *   GET    /response-templates           list (?department=it|security)
 *   POST   /response-templates           create
 *   PUT    /response-templates/:id        update
 *   DELETE /response-templates/:id        delete
 *
 * Gated to admin/super_admin. Placeholders like {{case_code}} can be embedded
 * in a body and are resolved client-side when the template is applied.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import type { AppBindings } from "../types";

export const responseTemplatesRouter = new Hono<AppBindings>();
responseTemplatesRouter.use("*", requireAuth);
responseTemplatesRouter.use("*", requireAdmin);

const DEPARTMENT = ["it", "security"] as const;

responseTemplatesRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const department = c.req.query("department");
  let rows;
  if (department) {
    rows = await sql`
      SELECT id, department, key, name, classification, subject, body, is_active, created_at, updated_at
      FROM response_templates WHERE department = ${department}
      ORDER BY name ASC`;
  } else {
    rows = await sql`
      SELECT id, department, key, name, classification, subject, body, is_active, created_at, updated_at
      FROM response_templates ORDER BY department, name ASC`;
  }
  return c.json({ templates: rows });
});

const upsertSchema = z.object({
  department: z.enum(DEPARTMENT),
  key: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, "lowercase letters, numbers, underscores only"),
  name: z.string().min(1).max(120),
  classification: z.string().max(120).nullable().optional(),
  subject: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(8000),
  is_active: z.boolean().optional(),
});

responseTemplatesRouter.post("/", zValidator("json", upsertSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const b = c.req.valid("json");
  const { clerkId } = c.get("user");
  try {
    const [row] = (await sql`
      INSERT INTO response_templates (department, key, name, classification, subject, body, is_active, created_by)
      VALUES (${b.department}, ${b.key}, ${b.name}, ${b.classification ?? null}, ${b.subject ?? null},
              ${b.body}, ${b.is_active ?? true}, ${clerkId})
      RETURNING id, department, key, name, classification, subject, body, is_active, created_at, updated_at
    `) as Array<Record<string, unknown>>;
    return c.json({ ok: true, template: row });
  } catch (err) {
    if (String((err as Error).message).includes("duplicate")) {
      return c.json({ error: "A template with that key already exists for this department." }, 409);
    }
    throw err;
  }
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  classification: z.string().max(120).nullable().optional(),
  subject: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(8000).optional(),
  is_active: z.boolean().optional(),
});

responseTemplatesRouter.put("/:id", zValidator("json", updateSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const b = c.req.valid("json");
  const setClassification = b.classification !== undefined;
  const setSubject = b.subject !== undefined;
  const [row] = (await sql`
    UPDATE response_templates SET
      name           = COALESCE(${b.name ?? null}, name),
      classification = CASE WHEN ${setClassification} THEN ${b.classification ?? null} ELSE classification END,
      subject        = CASE WHEN ${setSubject} THEN ${b.subject ?? null} ELSE subject END,
      body           = COALESCE(${b.body ?? null}, body),
      is_active      = COALESCE(${b.is_active ?? null}, is_active),
      updated_at     = NOW()
    WHERE id = ${id}
    RETURNING id, department, key, name, classification, subject, body, is_active, created_at, updated_at
  `) as Array<Record<string, unknown>>;
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true, template: row });
});

responseTemplatesRouter.delete("/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [row] = (await sql`DELETE FROM response_templates WHERE id = ${id} RETURNING id`) as Array<{ id: string }>;
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
