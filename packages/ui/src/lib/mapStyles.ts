export const MAPBOX_STYLES = {
  light: {
    style: 'mapbox://styles/mapbox/standard',
    config: {
      lightPreset: 'day',
      showPointOfInterestLabels: true,
      showTransitLabels: false,
    },
  },
  dark: {
    style: 'mapbox://styles/mapbox/standard',
    config: {
      lightPreset: 'dusk',
      showPointOfInterestLabels: true,
      showTransitLabels: false,
    },
  },
} as const

export function getMapStyle(isDark: boolean) {
  return isDark ? MAPBOX_STYLES.dark : MAPBOX_STYLES.light
}
