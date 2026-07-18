/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { LucideIcon } from "lucide-react";
import { cn } from "@sweepr/utils";
import { Card } from "../primitives/Card";
import { CountUp } from "../primitives/CountUp";

export function StatCard({
  label,
  value,
  countTo,
  format,
  icon: Icon,
  delta,
  deltaPositive,
}: {
  label: string;
  value: string;
  /** Opt-in: tween the value up to this number on mount/update. */
  countTo?: number;
  /** Formatter for the counted number (e.g. currency). */
  format?: (n: number) => string;
  icon?: LucideIcon;
  delta?: string;
  deltaPositive?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        {Icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-700 dark:bg-slate-800">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold text-charcoal dark:text-white">
        {countTo != null ? <CountUp value={countTo} format={format} /> : value}
      </p>
      {delta && (
        <p
          className={cn(
            "mt-1 text-xs font-medium",
            deltaPositive ? "text-emerald-700" : "text-red-700"
          )}
        >
          {delta}
        </p>
      )}
    </Card>
  );
}
