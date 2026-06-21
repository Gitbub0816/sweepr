import type { ReactNode } from "react";
import { useUser } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";
import { Clock } from "lucide-react";
import { LoadingState, ThemeToggle } from "@sweepr/ui";

const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

export type CleanerStatus =
  | "incomplete"
  | "pending_review"
  | "approved"
  | undefined;

function UnderReview() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-seafoam-50 via-offwhite to-seafoam-100 px-4 text-center dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-seafoam-500 text-white shadow-lg shadow-seafoam-500/30">
        <Clock className="h-7 w-7" />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-charcoal dark:text-white">
        Your application is under review
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        We typically review applications within 2–3 business days. We'll email you
        as soon as your account is approved.
      </p>
    </div>
  );
}

function GuardInner({ children }: { children: ReactNode }) {
  const { isLoaded, user } = useUser();

  if (!isLoaded) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <LoadingState rows={4} />
      </div>
    );
  }

  const status = user?.publicMetadata?.cleanerStatus as CleanerStatus;

  if (status === undefined || status === "incomplete") {
    return <Navigate to="/onboarding" replace />;
  }
  if (status === "pending_review") {
    return <UnderReview />;
  }
  // approved (or any other value) — let through
  return <>{children}</>;
}

/**
 * Routes a signed-in cleaner based on their onboarding status:
 *  - incomplete/undefined -> /onboarding
 *  - pending_review       -> holding page
 *  - approved             -> app
 * Renders through when Clerk is disabled (dev/preview).
 */
export function OnboardingGuard({ children }: { children: ReactNode }) {
  if (!CLERK_ENABLED) return <>{children}</>;
  return <GuardInner>{children}</GuardInner>;
}
