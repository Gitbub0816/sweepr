/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { MapPin } from "lucide-react";

export interface MapUnavailableFallbackProps {
  /**
   * Name of the service area to reference in the copy (e.g. "Bay Area",
   * "Hayward, CA"). Omit for a generic "map unavailable" message.
   */
  areaName?: string;
  className?: string;
}

/**
 * On-brand static placeholder for a "where we operate" service-area map when
 * the interactive Mapbox map can't render (no WebGL support, or a runtime
 * error caught by a local ErrorBoundary). Shared by ServiceAreaMap
 * (apps/cleaner) and CoverageMapSection (apps/marketing) so both keep the
 * same look instead of each inventing their own placeholder.
 */
export function MapUnavailableFallback({ areaName, className }: MapUnavailableFallbackProps) {
  return (
    <div
      className={
        className ??
        "flex h-64 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-seafoam-50 p-6 text-center dark:border-slate-700 dark:bg-slate-800"
      }
      role="img"
      aria-label={areaName ? `Map of ${areaName} unavailable` : "Map unavailable"}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-seafoam-100 text-seafoam-700 dark:bg-seafoam-900/30 dark:text-seafoam-300">
        <MapPin className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-charcoal dark:text-white">
        {areaName ? `We serve ${areaName}` : "Map unavailable"}
      </p>
      <p className="max-w-[220px] text-xs text-slate-500 dark:text-slate-400">
        The interactive map couldn't load in this browser.
      </p>
    </div>
  );
}
