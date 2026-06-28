import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { isOwnerClerkId } from "../lib/owner";
import type { AppBindings } from "../types";

export const adminServiceAreasRouter = new Hono<AppBindings>();

const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  if (isOwnerClerkId(c.get("user").clerkId, c.env)) return next();
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

adminServiceAreasRouter.use("*", requireAuth, requireAdmin);

// List all service areas
adminServiceAreasRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const areas = await sql`
    SELECT id, name, slug, status, polygon, center_lat, center_lng, created_at, updated_at
    FROM service_areas ORDER BY status DESC, name ASC
  `;
  return c.json({ areas });
});

const areaSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  status: z.enum(["live", "upcoming"]),
  centerLat: z.number().optional(),
  centerLng: z.number().optional(),
  polygon: z.array(z.tuple([z.number(), z.number()])).optional(),
});

adminServiceAreasRouter.post("/", zValidator("json", areaSchema), async (c) => {
  const { name, slug, status, centerLat, centerLng, polygon } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const rows = await sql`
    INSERT INTO service_areas (name, slug, status, center_lat, center_lng, polygon)
    VALUES (
      ${name}, ${slug}, ${status},
      ${centerLat ?? null}, ${centerLng ?? null},
      ${polygon ? JSON.stringify(polygon) : null}
    )
    RETURNING id
  ` as Array<{ id: string }>;
  return c.json({ ok: true, id: rows[0].id }, 201);
});

const patchSchema = areaSchema.partial();

adminServiceAreasRouter.patch("/:id", zValidator("json", patchSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  await sql`
    UPDATE service_areas SET
      name        = COALESCE(${body.name ?? null}, name),
      slug        = COALESCE(${body.slug ?? null}, slug),
      status      = COALESCE(${body.status ?? null}, status),
      center_lat  = COALESCE(${body.centerLat ?? null}, center_lat),
      center_lng  = COALESCE(${body.centerLng ?? null}, center_lng),
      polygon     = COALESCE(${body.polygon ? JSON.stringify(body.polygon) : null}::jsonb, polygon),
      updated_at  = NOW()
    WHERE id = ${id}
  `;
  return c.json({ ok: true });
});

adminServiceAreasRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);
  await sql`DELETE FROM service_areas WHERE id = ${id}`;
  return c.json({ ok: true });
});

// City requests (pins)
adminServiceAreasRouter.get("/requests", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const requests = await sql`
    SELECT id, input, lat, lng, created_at FROM city_requests ORDER BY created_at DESC
  `;
  const subscribers = await sql`
    SELECT email, city_input, created_at FROM city_subscribers ORDER BY created_at DESC
  `;
  return c.json({ requests, subscribers });
});
