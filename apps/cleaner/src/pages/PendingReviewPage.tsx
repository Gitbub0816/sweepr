import { CheckCircle2, Circle, Mail } from "lucide-react";
import { ThemeToggle } from "@sweepr/ui";

const TIMELINE = [
  { label: "Application submitted", done: true },
  { label: "Background check", done: false },
  { label: "Identity verified", done: false },
  { label: "Account approved", done: false },
];

export function PendingReviewPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-seafoam-50 via-offwhite to-seafoam-100 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-seafoam-500 text-white shadow-lg shadow-seafoam-500/30">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-charcoal dark:text-white">
          Your application is under review
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          We typically review applications within 2–3 business days.
        </p>

        <ul className="mt-8 space-y-4 text-left">
          {TIMELINE.map((step) => (
            <li key={step.label} className="flex items-center gap-3">
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-seafoam-500" />
              ) : (
                <Circle className="h-5 w-5 text-slate-300" />
              )}
              <span
                className={
                  step.done
                    ? "text-sm font-medium text-charcoal dark:text-white"
                    : "text-sm text-slate-400"
                }
              >
                {step.label}
                {!step.done && (
                  <span className="ml-2 text-xs text-slate-400">(pending)</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-xl bg-offwhite p-4 text-sm dark:bg-slate-800">
          <p className="flex items-center justify-center gap-2 text-slate-500">
            <Mail className="h-4 w-4" />
            <a
              href="mailto:support@getsweepr.com"
              className="font-medium text-seafoam-600"
            >
              support@getsweepr.com
            </a>
          </p>
          <p className="mt-2 text-xs text-slate-400">
            In the meantime, follow us on social — we'll be in touch soon.
          </p>
        </div>
      </div>
    </div>
  );
}
