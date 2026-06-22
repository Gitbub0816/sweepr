import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../../lib/db";
import { requireAuth } from "../../middleware/auth";
import type { AppBindings } from "../../types";

export const statusAdminRouter = new Hono<AppBindings>();

statusAdminRouter.use("*", requireAuth);

interface IncidentRow {
  id: string;
  title: string;
  summary: string;
  status: string;
  severity: string;
  affected_features: string[];
  is_prelaunch_update: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface UpdateRow {
  id: string;
  incident_id: string;
  message: string;
  status: string;
  created_at: string;
}

interface SettingRow {
  key: string;
  value: string;
}

statusAdminRouter.get("/incidents", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const incidents = (await sql`
    SELECT id, title, summary, status, severity, affected_features,
           is_prelaunch_update, created_at, updated_at, resolved_at
    FROM status_incidents
    ORDER BY created_at DESC
  `) as IncidentRow[];

  const incidentIds = incidents.map((i) => i.id);
  const updates: UpdateRow[] =
    incidentIds.length > 0
      ? (await sql`
          SELECT id, incident_id, message, status, created_at
          FROM status_updates
          WHERE incident_id = ANY(${incidentIds})
          ORDER BY created_at ASC
        `) as UpdateRow[]
      : [];

  const result = incidents.map((incident) => ({
    ...incident,
    updates: updates.filter((u) => u.incident_id === incident.id),
  }));

  return c.json(result);
});

const incidentBodySchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  severity: z.enum(["minor", "major", "critical"]),
  affected_features: z.array(z.string()),
  is_prelaunch_update: z.boolean(),
});

statusAdminRouter.post(
  "/incidents",
  zValidator("json", incidentBodySchema),
  async (c) => {
    const body = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const rows = (await sql`
      INSERT INTO status_incidents
        (title, summary, status, severity, affected_features, is_prelaunch_update)
      VALUES
        (${body.title}, ${body.summary}, ${body.status}, ${body.severity},
         ${body.affected_features}, ${body.is_prelaunch_update})
      RETURNING id
    `) as { id: string }[];
    return c.json({ id: rows[0].id }, 201);
  }
);

const patchIncidentSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]).optional(),
  severity: z.enum(["minor", "major", "critical"]).optional(),
  affected_features: z.array(z.string()).optional(),
  is_prelaunch_update: z.boolean().optional(),
});

statusAdminRouter.patch(
  "/incidents/:id",
  zValidator("json", patchIncidentSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);

    if (body.status === "resolved") {
      await sql`
        UPDATE status_incidents SET
          title = COALESCE(${body.title ?? null}, title),
          summary = COALESCE(${body.summary ?? null}, summary),
          status = COALESCE(${body.status ?? null}, status),
          severity = COALESCE(${body.severity ?? null}, severity),
          affected_features = COALESCE(${body.affected_features ?? null}, affected_features),
          is_prelaunch_update = COALESCE(${body.is_prelaunch_update ?? null}, is_prelaunch_update),
          resolved_at = NOW(),
          updated_at = NOW()
        WHERE id = ${id}
      `;
    } else {
      await sql`
        UPDATE status_incidents SET
          title = COALESCE(${body.title ?? null}, title),
          summary = COALESCE(${body.summary ?? null}, summary),
          status = COALESCE(${body.status ?? null}, status),
          severity = COALESCE(${body.severity ?? null}, severity),
          affected_features = COALESCE(${body.affected_features ?? null}, affected_features),
          is_prelaunch_update = COALESCE(${body.is_prelaunch_update ?? null}, is_prelaunch_update),
          updated_at = NOW()
        WHERE id = ${id}
      `;
    }
    return c.json({ ok: true });
  }
);

statusAdminRouter.post(
  "/incidents/:id/updates",
  zValidator(
    "json",
    z.object({
      message: z.string().min(1),
      status: z.string().min(1),
    })
  ),
  async (c) => {
    const incidentId = c.req.param("id");
    const { message, status } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const rows = (await sql`
      INSERT INTO status_updates (incident_id, message, status)
      VALUES (${incidentId}, ${message}, ${status})
      RETURNING id
    `) as { id: string }[];
    return c.json({ id: rows[0].id }, 201);
  }
);

statusAdminRouter.get("/settings", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT key, value FROM site_settings ORDER BY key
  `) as SettingRow[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return c.json(result);
});

statusAdminRouter.patch(
  "/settings",
  zValidator(
    "json",
    z.object({
      key: z.string().min(1),
      value: z.string(),
    })
  ),
  async (c) => {
    const { key, value } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    await sql`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    return c.json({ ok: true });
  }
);
