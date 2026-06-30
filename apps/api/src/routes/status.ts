import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { sendEmail, wrapBodyInTemplate } from "../lib/mailer";
import { et } from "../lib/emailI18n";
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
  // Fail-safe: if the DB is unreachable, keep the gate UP so the app stays gated.
  const defaultResponse = {
    settings: { prelaunch_cleaner: true, prelaunch_customer: true, prelaunch_pricing: true },
    incidents: [],
    maintenance: [],
  };

  try {
    const sql = getDb(c.env.DATABASE_URL);

    const settingsRows = (await sql`
      SELECT key, value FROM site_settings
      WHERE key IN ('prelaunch_cleaner', 'prelaunch_customer', 'prelaunch_pricing')
    `) as SettingRow[];

    // Default to true (gate UP / prelaunch on) when a row is missing.
    // Explicit "false" in the DB is the only way to open the gate.
    const settings = {
      prelaunch_cleaner: true,
      prelaunch_customer: true,
      prelaunch_pricing: true,
    };
    for (const row of settingsRows) {
      if (row.key === "prelaunch_cleaner") {
        settings.prelaunch_cleaner = row.value !== "false";
      } else if (row.key === "prelaunch_customer") {
        settings.prelaunch_customer = row.value !== "false";
      } else if (row.key === "prelaunch_pricing") {
        settings.prelaunch_pricing = row.value !== "false";
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

    const maintenance = await sql`
      SELECT id, title, description, scheduled_start, scheduled_end, affected_services, status
      FROM maintenance_windows
      WHERE status IN ('scheduled','in_progress')
        AND scheduled_end > NOW()
      ORDER BY scheduled_start ASC
    ` as Array<{
      id: string; title: string; description: string | null;
      scheduled_start: string; scheduled_end: string;
      affected_services: string[]; status: string;
    }>;

    const serviceAreas = (await sql`
      SELECT id, name, slug, status, polygon, center_lat, center_lng
      FROM service_areas ORDER BY status DESC, name ASC
    `) as Array<{
      id: string; name: string; slug: string; status: string;
      polygon: unknown; center_lat: number | null; center_lng: number | null;
    }>;

    const cityRequestPins = (await sql`
      SELECT lat, lng FROM city_requests
      WHERE lat IS NOT NULL AND lng IS NOT NULL
    `) as Array<{ lat: number; lng: number }>;

    return c.json({ settings, incidents: incidentsWithUpdates, maintenance, serviceAreas, cityRequestPins });
  } catch {
    return c.json({ ...defaultResponse, settings: { prelaunch_cleaner: false, prelaunch_customer: false, prelaunch_pricing: false }, serviceAreas: [], cityRequestPins: [], maintenance: [] });
  }
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
    const rows = await sql`
      INSERT INTO newsletter_subscribers (email)
      VALUES (${email})
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    ` as Array<{ id: string }>;

    // Send confirmation only for new subscribers (not duplicate sign-ups)
    if (rows.length > 0) {
      try {
        const [langRow] = await sql`
          SELECT preferred_language FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
        ` as Array<{ preferred_language: string | null }>;
        const lang = langRow?.preferred_language ?? "en";
        const subject = et(lang, "newsletter.confirm.subject");
        await sendEmail(c.env.MAILERSEND_API_KEY, {
          to: email,
          subject,
          html: wrapBodyInTemplate(subject, et(lang, "newsletter.confirm.body"), lang),
        });
      } catch {
        // Non-fatal — subscriber is saved, email failure shouldn't fail the request
      }
    }

    return c.json({ ok: true });
  }
);

// ---------------------------------------------------------------------------
// City request + optional city-updates subscribe
// ---------------------------------------------------------------------------
statusRouter.post(
  "/city-request",
  zValidator(
    "json",
    z.object({
      input: z.string().min(1).max(200),
      lat: z.number().optional(),
      lng: z.number().optional(),
      email: z.string().email().optional(),
      subscribeUpdates: z.boolean().optional(),
    })
  ),
  async (c) => {
    const { input, lat, lng, email, subscribeUpdates } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);

    await sql`
      INSERT INTO city_requests (input, lat, lng)
      VALUES (${input}, ${lat ?? null}, ${lng ?? null})
    `;

    if (email && subscribeUpdates) {
      const rows = await sql`
        INSERT INTO city_subscribers (email, area_slug, city_input)
        VALUES (${email}, NULL, ${input})
        ON CONFLICT (email, COALESCE(area_slug, '')) DO NOTHING
        RETURNING id
      ` as Array<{ id: string }>;

      if (rows.length > 0) {
        try {
          const [langRow] = await sql`
            SELECT preferred_language FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
          ` as Array<{ preferred_language: string | null }>;
          const lang = langRow?.preferred_language ?? "en";
          const subject = et(lang, "cityUpdates.subject");
          await sendEmail(c.env.MAILERSEND_API_KEY, {
            to: email,
            subject,
            html: wrapBodyInTemplate(subject, et(lang, "cityUpdates.body"), lang),
          });
        } catch { /* non-fatal */ }
      }
    }

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

    try {
      const [langRow] = await sql`
        SELECT preferred_language FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
      ` as Array<{ preferred_language: string | null }>;
      const lang = langRow?.preferred_language ?? "en";
      const subject = et(lang, "waitlist.subject");
      const bodyKey = type === "cleaner" ? "waitlist.body.cleaner" : "waitlist.body.customer";
      await sendEmail(c.env.MAILERSEND_API_KEY, {
        to: email,
        toName: name,
        subject,
        html: wrapBodyInTemplate(subject, et(lang, bodyKey), lang),
      });
    } catch { /* non-fatal */ }

    return c.json({ ok: true });
  }
);
