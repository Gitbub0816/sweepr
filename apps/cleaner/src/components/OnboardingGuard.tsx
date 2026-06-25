import type { ReactNode } from "react";
import { useUser } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import { Clock, Lock } from "lucide-react";
import { LoadingState, ThemeToggle } from "@sweepr/ui";

export type CleanerStatus =
  | "incomplete"
  | "pending_review"
  | "approved"
  | undefined;

/** Shown while the admin team reviews the completed application. */
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

/** Shown when an incomplete cleaner tries to reach a job-gated route. */
function JobsLocked() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
        <Lock className="h-6 w-6 text-slate-400" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-charcoal dark:text-white">
        Complete onboarding to unlock jobs
      </h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Finish your application and pass the background check to start accepting
        bookings on Sweepr.
      </p>
      <a
        href="/onboarding"
        className="mt-4 inline-block rounded-xl bg-seafoam-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-seafoam-600 transition-colors"
      >
        Continue onboarding →
      </a>
    </div>
  );
}

function GuardInner({ children, jobsGated }: { children: ReactNode; jobsGated: boolean }) {
  const { isLoaded, user } = useUser();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <LoadingState rows={4} />
      </div>
    );
  }

  const status = user?.publicMetadata?.cleanerStatus as CleanerStatus;

  // Application submitted, waiting for admin — show holding screen everywhere.
  if (status === "pending_review") {
    return <UnderReview />;
  }

  // Incomplete — can access dashboard + profile + training, but not jobs.
  if ((status === undefined || status === "incomplete") && jobsGated) {
    // Redirect /onboarding back into itself so the flow continues.
    if (location.pathname === "/onboarding") return <>{children}</>;
    return <JobsLocked />;
  }

  // approved, or incomplete on non-job routes — let through.
  return <>{children}</>;
}

/**
 * Cleaner onboarding gate.
 *
 * - incomplete/undefined: can reach dashboard, profile, training. Job-gated
 *   routes show a locked screen with a link to resume onboarding.
 * - pending_review: holding screen everywhere (application under review).
 * - approved: full access.
 */
export function OnboardingGuard({
  children,
  jobsGated = false,
}: {
  children: ReactNode;
  jobsGated?: boolean;
}) {
  return <GuardInner jobsGated={jobsGated}>{children}</GuardInner>;
}
