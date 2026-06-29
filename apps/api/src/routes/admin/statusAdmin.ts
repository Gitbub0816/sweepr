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
  auto_detected: boolean;
  error_fingerprint: string | null;
  affected_user_count: number | null;
  total_occurrences: number | null;
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

// ─── Incidents ───────────────────────────────────────────────────────────────

statusAdminRouter.get("/incidents", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const incidents = (await sql`
    SELECT id, title, summary, status, severity, affected_features,
           is_prelaunch_update, auto_detected, error_fingerprint,
           affected_user_count, total_occurrences, created_at, updated_at, resolved_at
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

const severityEnum = z.enum(["minor", "moderate", "major", "critical"]);

const incidentBodySchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  severity: severityEnum,
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
  severity: severityEnum.optional(),
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
          title              = COALESCE(${body.title ?? null}, title),
          summary            = COALESCE(${body.summary ?? null}, summary),
          status             = COALESCE(${body.status ?? null}, status),
          severity           = COALESCE(${body.severity ?? null}, severity),
          affected_features  = COALESCE(${body.affected_features ?? null}, affected_features),
          is_prelaunch_update = COALESCE(${body.is_prelaunch_update ?? null}, is_prelaunch_update),
          resolved_at        = NOW(),
          updated_at         = NOW()
        WHERE id = ${id}
      `;
    } else {
      await sql`
        UPDATE status_incidents SET
          title              = COALESCE(${body.title ?? null}, title),
          summary            = COALESCE(${body.summary ?? null}, summary),
          status             = COALESCE(${body.status ?? null}, status),
          severity           = COALESCE(${body.severity ?? null}, severity),
          affected_features  = COALESCE(${body.affected_features ?? null}, affected_features),
          is_prelaunch_update = COALESCE(${body.is_prelaunch_update ?? null}, is_prelaunch_update),
          updated_at         = NOW()
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

// ─── Site Settings ───────────────────────────────────────────────────────────

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

// ─── Maintenance Windows ─────────────────────────────────────────────────────

interface MaintenanceRow {
  id: string;
  title: string;
  description: string | null;
  scheduled_start: string;
  scheduled_end: string;
  affected_services: string[];
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const maintenanceSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  scheduled_start: z.string().datetime(),
  scheduled_end: z.string().datetime(),
  affected_services: z.array(z.string()),
});

statusAdminRouter.get("/maintenance", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT id, title, description, scheduled_start, scheduled_end,
           affected_services, status, created_by, created_at, updated_at
    FROM maintenance_windows
    WHERE status != 'cancelled'
    ORDER BY scheduled_start DESC
  `) as MaintenanceRow[];
  return c.json(rows);
});

statusAdminRouter.post(
  "/maintenance",
  zValidator("json", maintenanceSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user") as { id?: string; email?: string } | undefined;
    const createdBy = user?.email ?? user?.id ?? "admin";
    const sql = getDb(c.env.DATABASE_URL);
    const rows = (await sql`
      INSERT INTO maintenance_windows
        (title, description, scheduled_start, scheduled_end, affected_services, created_by)
      VALUES
        (${body.title}, ${body.description ?? null},
         ${body.scheduled_start}, ${body.scheduled_end},
         ${body.affected_services}, ${createdBy})
      RETURNING id
    `) as { id: string }[];
    return c.json({ id: rows[0].id }, 201);
  }
);

statusAdminRouter.patch(
  "/maintenance/:id",
  zValidator(
    "json",
    z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      scheduled_start: z.string().datetime().optional(),
      scheduled_end: z.string().datetime().optional(),
      affected_services: z.array(z.string()).optional(),
      status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
    })
  ),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    await sql`
      UPDATE maintenance_windows SET
        title             = COALESCE(${body.title ?? null}, title),
        description       = COALESCE(${body.description ?? null}, description),
        scheduled_start   = COALESCE(${body.scheduled_start ?? null}, scheduled_start),
        scheduled_end     = COALESCE(${body.scheduled_end ?? null}, scheduled_end),
        affected_services = COALESCE(${body.affected_services ?? null}, affected_services),
        status            = COALESCE(${body.status ?? null}, status),
        updated_at        = NOW()
      WHERE id = ${id}
    `;
    return c.json({ ok: true });
  }
);

statusAdminRouter.delete("/maintenance/:id", async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);
  await sql`
    UPDATE maintenance_windows SET status = 'cancelled', updated_at = NOW()
    WHERE id = ${id}
  `;
  return c.json({ ok: true });
});
