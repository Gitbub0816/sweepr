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
 * Public service-area availability check.
 *
 * The booking wizard needs a real answer to "do we clean here?" — which is
 * defined by the live `service_areas` polygons (admin-managed), NOT by a
 * hardcoded state list. Given a lat/lng from the address picker, this does a
 * point-in-polygon test against every live area (with a radius fallback for
 * areas that only have a center). Unauthenticated: it leaks nothing beyond
 * what the public status map already shows.
 *
 * Geometry lives in lib/serviceAreaGeo.ts, shared with the booking-calendar
 * date-rules engine so both resolve areas identically.
 */

import { Hono } from "hono";
import { getDb } from "../lib/db";
import { loadLiveServiceAreas, matchServiceArea } from "../lib/serviceAreaGeo";
import type { AppBindings } from "../types";

export const serviceAreaCheckRouter = new Hono<AppBindings>();

serviceAreaCheckRouter.get("/check", async (c) => {
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: "lat and lng are required" }, 400);
  }

  const sql = getDb(c.env.DATABASE_URL);
  const areas = await loadLiveServiceAreas(sql);
  const match = matchServiceArea(areas, lat, lng);

  return c.json({
    available: match !== null,
    area: match?.name ?? null,
    liveAreas: areas.map((a) => a.name),
  });
});
