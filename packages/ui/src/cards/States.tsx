/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { ReactNode } from "react";
import { Inbox, AlertCircle } from "lucide-react";
import { cn } from "@sweepr/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-10 text-center dark:border-slate-700",
        className
      )}
    >
      <div className="mb-3 text-slate-300">
        {icon ?? <Inbox className="h-10 w-10" />}
      </div>
      <h3 className="text-base font-semibold text-charcoal dark:text-white">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-10 text-center dark:border-red-900/40 dark:bg-red-950/20">
      <AlertCircle className="mb-3 h-10 w-10 text-red-400" />
      <h3 className="text-base font-semibold text-red-700 dark:text-red-300">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-red-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-16 w-full animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800"
        />
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800",
        className
      )}
    />
  );
}

/**
 * Table-shaped skeleton: a header strip plus evenly-spaced rows, so a data
 * table that takes a moment to load reserves its layout instead of collapsing
 * to a centered spinner. `role="status"` announces the busy state to AT.
 */
export function TableSkeleton({
  rows = 6,
  cols = 4,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800",
        className
      )}
    >
      <div className="flex gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-slate-50 px-4 py-3.5 last:border-0 dark:border-slate-800/60"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn("h-4 flex-1", c === 0 && "max-w-[40%]")}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/**
 * Grid of stat-card-shaped blocks for dashboards that lead with KPI tiles.
 */
export function StatGridSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"
        >
          <Skeleton className="mb-3 h-4 w-4 rounded-md" />
          <Skeleton className="mb-2 h-7 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/**
 * Vertical list of card-shaped rows — for list/card layouts rather than tables.
 */
export function CardListSkeleton({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className={cn("space-y-3", className)}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
        >
          <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
