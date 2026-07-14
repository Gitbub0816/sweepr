/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

export const MAPBOX_STYLES = {
  light: {
    style: 'mapbox://styles/mapbox/standard',
    config: {
      lightPreset: 'day',
      colorTheme: 'faded',
      show3dObjects: true,
      showPointOfInterestLabels: true,
      showTransitLabels: false,
    },
  },
  dark: {
    style: 'mapbox://styles/mapbox/standard',
    config: {
      lightPreset: 'night',
      colorTheme: 'default',
      show3dObjects: true,
      showPointOfInterestLabels: true,
      showTransitLabels: false,
    },
  },
} as const

/** Default camera pitch so 3D buildings/landmarks read as 3D everywhere. */
export const MAP_3D_PITCH = 52

export function getMapStyle(isDark: boolean) {
  return isDark ? MAPBOX_STYLES.dark : MAPBOX_STYLES.light
}

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

/** Minimal structural type so this lib doesn't depend on mapbox-gl. */
interface BasemapConfigurable {
  setConfigProperty(importId: string, name: string, value: unknown): void;
  on(event: string, cb: () => void): unknown;
}

/** Push the current theme's basemap config (light preset, color theme,
 *  3D objects) onto a Mapbox Standard map. Safe to call repeatedly. */
export function applyMapTheme(map: BasemapConfigurable, dark: boolean = isDarkTheme()) {
  const { config } = getMapStyle(dark);
  try {
    for (const [key, value] of Object.entries(config)) {
      map.setConfigProperty("basemap", key, value);
    }
  } catch {
    // style not ready yet; the style.load hook in bindMapTheme will re-apply
  }
}

/**
 * Keep a Mapbox Standard map in sync with the app theme for its lifetime:
 * applies the theme on every style load and whenever the `dark` class on
 * <html> (or the stored theme in another tab) changes. Returns a cleanup
 * function — call it in the effect cleanup alongside map.remove().
 */
export function bindMapTheme(map: BasemapConfigurable): () => void {
  const apply = () => applyMapTheme(map);
  map.on("style.load", apply);
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

/** Returns the Mapbox public token from the Vite environment. Checks both
 *  VITE_MAPBOX_PUBLIC_TOKEN (preferred) and VITE_MAPBOX_TOKEN (legacy). */
export function getMapboxToken(): string {
  return (
    (import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string | undefined) ||
    (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ||
    ""
  );
}
