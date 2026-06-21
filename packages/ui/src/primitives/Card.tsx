import type { HTMLAttributes } from "react";
import { cn } from "@sweepr/utils";

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900",
        className
      )}
      {...props}
    />
  );
}
