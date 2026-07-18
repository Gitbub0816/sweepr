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
import { Link } from "react-router-dom";
import { ArrowLeft, FlaskConical, RotateCcw, Check } from "lucide-react";
import { ThemeToggle, SweeprLogo } from "@sweepr/ui";
import { cn } from "@sweepr/utils";

/**
 * Persistent chrome shared by every demo flow: the standing "no real bookings"
 * banner, a Sweepr-branded header with a back-to-index link and theme toggle,
 * a step indicator, and a per-flow Reset button. Everything below runs on
 * local in-memory state — this component never touches the network.
 */
export function DemoChrome({
  title,
  persona,
  steps,
  current,
  onReset,
  children,
}: {
  title: string;
  persona: string;
  steps: string[];
  current: number;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-offwhite dark:bg-slate-950">
      {/* Standing demo banner */}
      <div className="sticky top-0 z-40 border-b border-seafoam-200/70 bg-seafoam-50/95 backdrop-blur dark:border-seafoam-900/60 dark:bg-seafoam-950/70">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-1.5 text-[12px] font-medium text-seafoam-800 dark:text-seafoam-200">
          <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Demo environment. No real bookings, payments, or background checks.</span>
        </div>
      </div>

      <header className="sticky top-[29px] z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link to="/" aria-label="All demo flows" className="flex items-center gap-2 text-slate-500 transition-colors hover:text-charcoal dark:hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            <SweeprLogo size="md" />
          </Link>
          <div className="ml-1 min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-charcoal dark:text-white">{title}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{persona}</p>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-[transform,background-color,color] duration-150 ease-out [@media(hover:hover)]:active:scale-[0.97] hover:bg-slate-100 hover:text-charcoal dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
          <ThemeToggle />
        </div>

        {/* Step indicator */}
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <Stepper steps={steps} current={current} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}

function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Flow progress">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors duration-200",
                done && "bg-seafoam-600 text-white",
                active && "bg-seafoam-100 text-seafoam-700 ring-2 ring-seafoam-500 dark:bg-seafoam-900/50 dark:text-seafoam-200",
                !done && !active && "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
              )}
              aria-current={active ? "step" : undefined}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden truncate text-[11px] font-medium sm:inline",
                active ? "text-charcoal dark:text-white" : "text-slate-400 dark:text-slate-500"
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  "h-px flex-1 rounded-full transition-colors duration-300",
                  done ? "bg-seafoam-400" : "bg-slate-200 dark:bg-slate-800"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Fades a step panel in on mount. Respects prefers-reduced-motion via CSS. */
export function StepPanel({ stepKey, children }: { stepKey: string | number; children: ReactNode }) {
  return (
    <div key={stepKey} className="motion-safe:animate-[demo-fade_260ms_cubic-bezier(0.23,1,0.32,1)]">
      {children}
    </div>
  );
}
