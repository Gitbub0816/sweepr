/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Clock } from "lucide-react";

function fmtDist(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1609.34).toFixed(1)} mi`;
}

function fmtDuration(s: number): string {
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export interface NavigationBottomBarProps {
  remainingDurationSeconds: number;
  distanceRemainingMeters: number;
  estimatedArrival: Date | null;
}

/** Same style as the old packages/ui NavigationMap.tsx ETA bar. Padded for
 *  the bottom safe-area inset on notched/gesture-bar phones. */
export function NavigationBottomBar({
  remainingDurationSeconds,
  distanceRemainingMeters,
  estimatedArrival,
}: NavigationBottomBarProps) {
  return (
    <div
      className="bg-slate-900 text-white px-4 py-2 flex items-center gap-4 text-sm"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <Clock className="h-4 w-4 text-seafoam-400 shrink-0" aria-hidden="true" />
      <span className="font-semibold">{fmtDuration(remainingDurationSeconds)}</span>
      <span className="text-slate-600">·</span>
      <span className="text-slate-600">{fmtDist(distanceRemainingMeters)}</span>
      {estimatedArrival && (
        <span className="ml-auto text-seafoam-400 font-medium">
          ETA {estimatedArrival.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </div>
  );
}
