import { Check } from "lucide-react";
import { cn } from "@sweepr/utils";

export interface StepperProps {
  steps: string[];
  current: number; // zero-based index
  className?: string;
}

export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <ol className={cn("flex items-center gap-2", className)}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                done && "bg-seafoam-500 text-white",
                active && "bg-seafoam-100 text-seafoam-700 ring-2 ring-seafoam-400",
                !done && !active && "bg-slate-100 text-slate-400 dark:bg-slate-800"
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                "hidden truncate text-xs font-medium sm:block",
                active ? "text-charcoal dark:text-white" : "text-slate-400"
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "h-px flex-1",
                  done ? "bg-seafoam-400" : "bg-slate-200 dark:bg-slate-700"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
