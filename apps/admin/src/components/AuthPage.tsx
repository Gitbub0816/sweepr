import type { ReactNode } from "react";
import { ThemeToggle } from "@sweepr/ui";

/** Centered seafoam-gradient auth layout for the admin app. Dark-mode aware. */
export function AuthPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-seafoam-50 via-offwhite to-seafoam-100 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-seafoam-500 text-xl font-bold text-white shadow-lg shadow-seafoam-500/30">
          S
        </div>
        <h1 className="mt-4 text-2xl font-bold text-charcoal dark:text-white">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex w-full justify-center">{children}</div>
    </div>
  );
}
