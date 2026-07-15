/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Navigation, ChevronRight } from "lucide-react";
import type { RouteStep } from "../types/navigation";

function fmtDist(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1609.34).toFixed(1)} mi`;
}

export interface ManeuverBannerProps {
  currentStep: RouteStep | null;
  nextStep: RouteStep | null;
  distanceToManeuverMeters: number;
}

/** Same visual language as the old packages/ui NavigationMap.tsx banner:
 *  dark background, Navigation icon, ChevronRight "then:" line. */
export function ManeuverBanner({ currentStep, nextStep, distanceToManeuverMeters }: ManeuverBannerProps) {
  if (!currentStep) return null;

  return (
    <div className="bg-charcoal text-white px-4 py-3 flex items-start gap-3">
      <Navigation className="h-5 w-5 text-seafoam-400 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug truncate">{currentStep.instruction}</p>
        {nextStep && (
          <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            then: {nextStep.instruction}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-seafoam-400 font-medium">{fmtDist(distanceToManeuverMeters)}</p>
      </div>
    </div>
  );
}
