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
 * Shared Mapbox GL JS foundation for every Sweepr frontend.
 *
 * Replaces the old Apple MapKit lib (`mapStyles.ts`). The public Mapbox token
 * is baked into every build by CI (`VITE_MAPBOX_TOKEN`, from
 * `secrets.VITE_MAPBOX_PUBLIC_TOKEN`) so there is no token endpoint to call —
 * unlike MapKit, Mapbox authenticates with the public access token directly.
 *
 * Consumers should prefer the `<MapboxMap>` React component for ordinary maps
 * and only reach for these primitives when they need imperative control
 * (custom overlays, live tracking, directions previews).
 */

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export { mapboxgl };

/** Mapbox style URLs used across the apps. Light = streets, dark = dark. */
export const MAP_STYLE_LIGHT = "mapbox://styles/mapbox/streets-v12";
export const MAP_STYLE_DARK = "mapbox://styles/mapbox/dark-v11";

/**
 * The public Mapbox access token, baked at build time by CI. Returns an empty
 * string when unset so callers can render a graceful fallback (mirrors the old
 * missing-token UX) rather than throwing.
 */
export function getMapboxToken(): string {
  try {
    return (import.meta.env?.VITE_MAPBOX_TOKEN as string | undefined) ?? "";
  } catch {
    return "";
  }
}

/**
 * True when the browser can actually create a WebGL context. Some browsers
 * expose the WebGL APIs but fail at real context creation (blocked GPU,
 * WebGL disabled in settings, some in-app webviews) — mapbox-gl's renderer
 * then throws synchronously inside `new mapboxgl.Map()`. Mirrors the same
 * check `canUseWebGL()` in apps/marketing's HeroScene.tsx (kept as a
 * separate copy here so this package doesn't take on a dependency on that
 * app).
 */
export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") ||
          canvas.getContext("webgl") ||
          canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

/** True when the app is in dark mode (Tailwind `dark` class or stored pref). */
export function isDarkTheme(): boolean {
  if (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  )
    return true;
  try {
    return localStorage.getItem("theme") === "dark";
  } catch {
    return false;
  }
}

/** The Mapbox style URL for the given (or current) theme. */
export function mapStyleForTheme(dark: boolean = isDarkTheme()): string {
  return dark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
}

export interface CreateMapboxMapOptions
  extends Omit<mapboxgl.MapOptions, "container" | "accessToken" | "style"> {
  /** Force a specific style; defaults to the current theme's style. */
  style?: string;
}

/**
 * Creates a `mapboxgl.Map` with the access token applied, the theme style
 * selected, and sane defaults. Returns `null` when no token is configured,
 * when the browser can't do WebGL, or when construction throws for any other
 * reason — so callers can always render a fallback instead of crashing.
 * Never throws. Remember to call `map.remove()` on unmount.
 */
export function createMapboxMap(
  container: HTMLElement,
  opts: CreateMapboxMapOptions = {},
): mapboxgl.Map | null {
  const token = getMapboxToken();
  if (!token) return null;
  if (!supportsWebGL()) return null;
  mapboxgl.accessToken = token;

  const { style, ...rest } = opts;
  try {
    return new mapboxgl.Map({
      container,
      style: style ?? mapStyleForTheme(),
      attributionControl: true,
      ...rest,
    });
  } catch (err) {
    // Covers WebGL failures that pass the cheap capability check above but
    // still fail at real context creation, plus any other constructor-time
    // error (bad style URL, etc.) — never let a map failure crash the app.
    console.warn("Sweepr: Mapbox map failed to initialize, falling back", err);
    return null;
  }
}

/**
 * A universal "Open in Maps" deep link. On iOS/Android this opens the native
 * maps app; on desktop it opens Google Maps in the browser. Used for the
 * cleaner nav handoff (the native app does real turn-by-turn; the web SDK is
 * not licensed for it).
 */
export function openInMapsUrl(lat: number, lng: number, _label?: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/**
 * Keep a Mapbox map's style in sync with the app theme for its lifetime:
 * re-applies the correct style whenever the `dark` class on <html> toggles (or
 * the stored theme changes in another tab). Returns a cleanup function — call
 * it in the effect cleanup alongside `map.remove()`.
 *
 * NOTE: `map.setStyle` reloads the base style and drops any custom
 * sources/layers/markers the caller added. Components that draw their own
 * overlays should re-add them on the map's `style.load` event, or skip
 * `bindMapTheme` and manage the style themselves.
 */
export function bindMapTheme(map: mapboxgl.Map): () => void {
  let current = isDarkTheme();
  const apply = () => {
    const dark = isDarkTheme();
    if (dark === current) return;
    current = dark;
    try {
      map.setStyle(mapStyleForTheme(dark));
    } catch {
      // map already removed
    }
  };
  if (typeof window === "undefined") return () => {};
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  window.addEventListener("storage", apply);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", apply);
  };
}
