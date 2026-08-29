/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { getMapboxToken } from "@sweepr/ui";

export interface GeocodeSuggestion {
  placeName: string;
  center: [number, number]; // [lng, lat]
}

/**
 * Build the Mapbox Geocoding API URL for a US address query. Exported so the
 * request shape stays testable without hitting the network.
 */
export function geocodeUrl(query: string, token: string): string {
  return (
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?access_token=${token}&autocomplete=true&country=us&types=address&limit=5`
  );
}

/** Parse a Mapbox Geocoding response into simple {placeName, center} suggestions. */
export function parseGeocodeResponse(data: unknown): GeocodeSuggestion[] {
  const features = (data as { features?: Array<{ place_name?: string; center?: number[] }> })
    ?.features;
  if (!Array.isArray(features)) return [];
  const out: GeocodeSuggestion[] = [];
  for (const f of features) {
    const c = f.center;
    if (!Array.isArray(c) || c.length < 2 || typeof c[0] !== "number" || typeof c[1] !== "number")
      continue;
    out.push({ placeName: f.place_name ?? "", center: [c[0], c[1]] });
  }
  return out;
}

/** Forward-geocode a query, returning up to five address suggestions. */
export async function geocodeSuggestions(query: string): Promise<GeocodeSuggestion[]> {
  const q = query.trim();
  if (!q) return [];
  const token = getMapboxToken();
  if (!token) return [];
  try {
    const res = await fetch(geocodeUrl(q, token));
    if (!res.ok) return [];
    return parseGeocodeResponse(await res.json());
  } catch {
    return [];
  }
}

/** Forward-geocode a query to the single best [lng, lat], or null. */
export async function geocode(query: string): Promise<[number, number] | null> {
  const suggestions = await geocodeSuggestions(query);
  return suggestions[0]?.center ?? null;
}
