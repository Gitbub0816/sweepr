export const MAPBOX_STYLES = {
  light: {
    style: 'mapbox://styles/mapbox/standard',
    config: {
      lightPreset: 'day',
      colorTheme: 'faded',
      showPointOfInterestLabels: true,
      showTransitLabels: false,
    },
  },
  dark: {
    style: 'mapbox://styles/mapbox/standard',
    config: {
      lightPreset: 'dusk',
      colorTheme: 'default',
      showPointOfInterestLabels: true,
      showTransitLabels: false,
    },
  },
} as const

export function getMapStyle(isDark: boolean) {
  return isDark ? MAPBOX_STYLES.dark : MAPBOX_STYLES.light
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
