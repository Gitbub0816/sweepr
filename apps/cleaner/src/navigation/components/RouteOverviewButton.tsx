/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Map } from "lucide-react";

export interface RouteOverviewButtonProps {
  onShowOverview(): void;
}

export function RouteOverviewButton({ onShowOverview }: RouteOverviewButtonProps) {
  return (
    <button
      type="button"
      onClick={onShowOverview}
      aria-label="Show full route overview"
      className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-md dark:bg-charcoal dark:text-slate-200"
    >
      <Map className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
