/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

declare global {
  interface Window {
    mapkit?: any;
  }
}

const MAPKIT_SCRIPT_SRC = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";

let mapkitLoadPromise: Promise<any> | null = null;

/**
 * Loads Apple MapKit JS from Apple's CDN (once, module-level) and calls
 * `mapkit.init` with an authorizationCallback that fetches a short-lived
 * token from `${apiBase}/maps/apple-token`. Resolves with `window.mapkit`
 * once ready. Safe to call from multiple components — subsequent calls
 * reuse the same script tag / init.
 *
 * Rejects if the script fails to load or the token endpoint returns a
 * non-2xx response (e.g. 503 when Apple Maps isn't configured); callers
 * should catch this and render the same fallback UX that used to show for
 * a missing Mapbox token.
 */
export function loadMapkit(apiBase: string): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MapKit JS requires a browser environment"));
  }
  if (window.mapkit?.maps) {
    return Promise.resolve(window.mapkit);
  }
  if (mapkitLoadPromise) return mapkitLoadPromise;

  mapkitLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${MAPKIT_SCRIPT_SRC}"]`
    );

    const initMapkit = () => {
      const mapkit = window.mapkit;
      if (!mapkit) {
        reject(new Error("MapKit JS failed to load"));
        return;
      }
      try {
        mapkit.init({
          authorizationCallback: (done: (token: string) => void) => {
            fetch(`${apiBase}/maps/apple-token`)
              .then((r) => {
                if (!r.ok) throw new Error(`Apple Maps token request failed (${r.status})`);
                return r.json() as Promise<{ token: string; expiresAt: number }>;
              })
              .then((d) => done(d.token))
              .catch((err) => {
                mapkitLoadPromise = null;
                reject(err instanceof Error ? err : new Error("Apple Maps token request failed"));
              });
          },
        });
        resolve(mapkit);
      } catch (err) {
        mapkitLoadPromise = null;
        reject(err instanceof Error ? err : new Error("MapKit JS init failed"));
      }
    };

    if (existing) {
      if (window.mapkit) {
        initMapkit();
      } else {
        existing.addEventListener("load", initMapkit, { once: true });
        existing.addEventListener(
          "error",
          () => {
            mapkitLoadPromise = null;
            reject(new Error("MapKit JS failed to load"));
          },
          { once: true }
        );
      }
      return;
    }

    const script = document.createElement("script");
    script.src = MAPKIT_SCRIPT_SRC;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", initMapkit, { once: true });
    script.addEventListener(
      "error",
      () => {
        mapkitLoadPromise = null;
        reject(new Error("MapKit JS failed to load"));
      },
      { once: true }
    );
    document.head.appendChild(script);
  });

  return mapkitLoadPromise;
}

/**
 * MapKit JS has no manual camera pitch/bearing setter the way Mapbox GL
 * does (that control exists only in native iOS/macOS MapKit's MKMapCamera).
 * The closest equivalent MapKit JS actually exposes is the map type: the
 * `Standard` map type renders 3D buildings automatically at high zoom in
 * supported cities, with no way to set an arbitrary tilt/heading from code.
 * Kept (as `undefined`) so call sites that used to pass a pitch value have
 * an explicit, documented no-op instead of silently dropping the prop.
 */
export const MAP_3D_PITCH = undefined;

/** True when the app is in dark mode (Tailwind `dark` class or stored pref). */
export function isDarkTheme(): boolean {
  if (typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")) return true;
  try {
    return localStorage.getItem("theme") === "dark";
  } catch {
    return false;
  }
}

/** Minimal structural type so this lib doesn't depend on mapkit's types. */
interface ColorSchemeMap {
  colorScheme: string;
}

/** Push the current theme's color scheme onto a MapKit map. Safe to call
 *  repeatedly. `mapkit` is passed in so callers don't need a second global
 *  lookup. */
export function applyMapTheme(mapkit: any, map: ColorSchemeMap, dark: boolean = isDarkTheme()) {
  try {
    map.colorScheme = dark ? mapkit.Map.ColorSchemes.Dark : mapkit.Map.ColorSchemes.Light;
  } catch {
    // map not ready yet
  }
}

/**
 * Keep a MapKit map in sync with the app theme for its lifetime: applies
 * the theme immediately and whenever the `dark` class on <html> (or the
 * stored theme in another tab) changes. Returns a cleanup function — call
 * it in the effect cleanup alongside map.destroy().
 */
export function bindMapTheme(mapkit: any, map: ColorSchemeMap): () => void {
  const apply = () => applyMapTheme(mapkit, map);
  apply();
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
