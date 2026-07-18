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
 */

import { Hono } from "hono";
import { getDb } from "../lib/db";
import type { AppBindings } from "../types";

export const serviceAreaCheckRouter = new Hono<AppBindings>();

type Ring = Array<[number, number]>; // [lng, lat] pairs (GeoJSON order)

/** Ray-casting point-in-polygon on a single ring. */
function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Accepts the polygon shapes we store: a ring, or an array of rings. */
function pointInPolygon(lng: number, lat: number, polygon: unknown): boolean {
  if (!Array.isArray(polygon) || polygon.length === 0) return false;
  const first = polygon[0];
  // Ring: [[lng,lat],...]
  if (Array.isArray(first) && typeof first[0] === "number") {
    return pointInRing(lng, lat, polygon as Ring);
  }
  // Multi-ring: [[[lng,lat],...], ...] — outer ring decides, holes ignored
  // (our areas are simple shapes; holes aren't used).
  if (Array.isArray(first) && Array.isArray(first[0])) {
    return (polygon as Ring[]).some((ring) => pointInRing(lng, lat, ring));
  }
  return false;
}

function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Fallback radius for live areas that have a center but no polygon yet. */
const CENTER_FALLBACK_MILES = 60;

serviceAreaCheckRouter.get("/check", async (c) => {
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: "lat and lng are required" }, 400);
  }

  const sql = getDb(c.env.DATABASE_URL);
  const areas = (await sql`
    SELECT name, slug, polygon, center_lat, center_lng
    FROM service_areas WHERE status = 'live'
  `) as Array<{
    name: string;
    slug: string;
    polygon: unknown;
    center_lat: number | null;
    center_lng: number | null;
  }>;

  let match: string | null = null;
  for (const area of areas) {
    if (area.polygon && pointInPolygon(lng, lat, area.polygon)) {
      match = area.name;
      break;
    }
    if (
      !area.polygon &&
      area.center_lat != null &&
      area.center_lng != null &&
      milesBetween(lat, lng, area.center_lat, area.center_lng) <= CENTER_FALLBACK_MILES
    ) {
      match = area.name;
      break;
    }
  }

  return c.json({
    available: match !== null,
    area: match,
    liveAreas: areas.map((a) => a.name),
  });
});
