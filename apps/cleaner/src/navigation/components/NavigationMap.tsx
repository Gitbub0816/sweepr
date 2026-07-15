/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { UseNavigationSessionResult } from "../hooks/useNavigationSession";

export interface NavigationMapProps {
  session: Pick<UseNavigationSessionResult, "containerRef" | "mapStatus">;
}

/**
 * The MapKit container itself. This SUPERSEDES
 * packages/ui/src/components/NavigationMap.tsx for the cleaner day-of-service
 * flow — the old shared component is left in place (still used elsewhere)
 * until a follow-up integration step swaps JobDetailPage.tsx's import once
 * both navigation-agent halves are merged and verified together.
 *
 * All annotations/overlays/camera are created and torn down imperatively by
 * useNavigationSession — this component only renders the map's DOM container
 * and a fallback for the loading/error states.
 */
export function NavigationMap({ session }: NavigationMapProps) {
  const { containerRef, mapStatus } = session;

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        role="img"
        aria-label="Turn-by-turn navigation map"
        className="h-full w-full"
        style={{ visibility: mapStatus === "ready" ? "visible" : "hidden" }}
      />
      {mapStatus === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-charcoal">
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading map…</p>
        </div>
      )}
      {mapStatus === "error" && (
        <div
          data-testid="navigation-map-unavailable"
          className="absolute inset-0 flex items-center justify-center bg-slate-100 px-6 text-center dark:bg-charcoal"
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Navigation map unavailable. You can still get directions using the
            &ldquo;Open in Apple Maps&rdquo; button below.
          </p>
        </div>
      )}
    </div>
  );
}
