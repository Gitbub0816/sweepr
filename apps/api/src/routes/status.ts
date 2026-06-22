import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import type { AppBindings } from "../types";

export const statusRouter = new Hono<AppBindings>();

interface SettingRow {
  key: string;
  value: string;
}

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

statusRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);

  const settingsRows = (await sql`
    SELECT key, value FROM site_settings
    WHERE key IN ('prelaunch_cleaner', 'prelaunch_customer')
  `) as SettingRow[];

  const settings = {
    prelaunch_cleaner: false,
    prelaunch_customer: false,
  };
  for (const row of settingsRows) {
    if (row.key === "prelaunch_cleaner") {
      settings.prelaunch_cleaner = row.value === "true";
    } else if (row.key === "prelaunch_customer") {
      settings.prelaunch_customer = row.value === "true";
    }
  }

  const incidents = (await sql`
    SELECT id, title, summary, status, severity, affected_features,
           is_prelaunch_update, created_at, updated_at, resolved_at
    FROM status_incidents
    WHERE status != 'resolved'
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

  const incidentsWithUpdates = incidents.map((incident) => ({
    ...incident,
    updates: updates.filter((u) => u.incident_id === incident.id),
  }));

  return c.json({ settings, incidents: incidentsWithUpdates });
});

statusRouter.post(
  "/subscribe",
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      incidentId: z.string().uuid(),
    })
  ),
  async (c) => {
    const { email, incidentId } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    await sql`
      INSERT INTO status_subscribers (email, incident_id)
      VALUES (${email}, ${incidentId})
      ON CONFLICT (email, incident_id) DO NOTHING
    `;
    return c.json({ ok: true });
  }
);

statusRouter.post(
  "/newsletter",
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
    })
  ),
  async (c) => {
    const { email } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    await sql`
      INSERT INTO newsletter_subscribers (email)
      VALUES (${email})
      ON CONFLICT (email) DO NOTHING
    `;
    return c.json({ ok: true });
  }
);

statusRouter.post(
  "/waitlist",
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      name: z.string().optional(),
      phone: z.string().optional(),
      zipCode: z.string().optional(),
      type: z.enum(["cleaner", "customer"]),
    })
  ),
  async (c) => {
    const { email, name, phone, zipCode, type } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    await sql`
      INSERT INTO waitlist (email, name, phone, zip_code, type)
      VALUES (${email}, ${name ?? null}, ${phone ?? null}, ${zipCode ?? null}, ${type})
    `;
    return c.json({ ok: true });
  }
);
