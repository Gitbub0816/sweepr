import type { ReactNode } from "react";
import { cn } from "@sweepr/utils";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_TONE,
  type StatusTone,
} from "@sweepr/utils";
import type { JobStatus } from "@sweepr/types";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

const variants: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  error: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  info: "bg-seafoam-100 text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300",
};

export function Badge({
  variant = "default",
  children,
  className,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

const toneToVariant: Record<StatusTone, BadgeVariant> = {
  default: "default",
  success: "success",
  warning: "warning",
  error: "error",
  info: "info",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const label = JOB_STATUS_LABELS[status];
  return (
    <span role="status" aria-label={`Status: ${label}`}>
      <Badge variant={toneToVariant[JOB_STATUS_TONE[status]]}>{label}</Badge>
    </span>
  );
}
