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
 * Service-area geometry, extracted from routes/serviceAreaCheck.ts so the
 * booking-calendar date-rules engine and the public availability check share
 * ONE point-in-area implementation (admin-managed polygons with a radius
 * fallback for areas that only have a center).
 */

import type { Sql } from "./db";
import { haversineDistance } from "./haversine";

export type Ring = Array<[number, number]>; // [lng, lat] pairs (GeoJSON order)

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
export function pointInPolygon(lng: number, lat: number, polygon: unknown): boolean {
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

/** Fallback radius for live areas that have a center but no polygon yet. */
export const CENTER_FALLBACK_MILES = 60;

export interface ServiceAreaGeoRow {
  id: string;
  name: string;
  slug: string;
  polygon: unknown;
  center_lat: number | null;
  center_lng: number | null;
}

/** Load every live service area with its geometry. */
export async function loadLiveServiceAreas(sql: Sql): Promise<ServiceAreaGeoRow[]> {
  return (await sql`
    SELECT id, name, slug, polygon, center_lat, center_lng
    FROM service_areas WHERE status = 'live'
  `) as ServiceAreaGeoRow[];
}

/**
 * Match a point to the first live service area containing it (polygon test,
 * with the center-radius fallback for polygon-less areas). Pure so callers can
 * resolve many points against one loaded area list.
 */
export function matchServiceArea(
  areas: ServiceAreaGeoRow[],
  lat: number,
  lng: number,
): ServiceAreaGeoRow | null {
  for (const area of areas) {
    if (area.polygon && pointInPolygon(lng, lat, area.polygon)) return area;
    if (
      !area.polygon &&
      area.center_lat != null &&
      area.center_lng != null &&
      haversineDistance(lat, lng, Number(area.center_lat), Number(area.center_lng)) <=
        CENTER_FALLBACK_MILES
    ) {
      return area;
    }
  }
  return null;
}

/**
 * Resolve the service-area id for a point, or null when the point is outside
 * every live area (or when coordinates are missing/invalid) — callers then
 * apply platform-wide rules only, which is the safe default.
 */
export async function resolveServiceAreaId(
  sql: Sql,
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<string | null> {
  if (lat == null || lng == null) return null;
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
  const areas = await loadLiveServiceAreas(sql);
  return matchServiceArea(areas, nLat, nLng)?.id ?? null;
}
