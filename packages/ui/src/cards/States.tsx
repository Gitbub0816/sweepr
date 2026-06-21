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
