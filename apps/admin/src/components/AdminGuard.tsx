import type { ReactNode } from "react";
import { useUser, useClerk } from "@clerk/clerk-react";
import { LoadingState, Button, ThemeToggle } from "@sweepr/ui";

const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

function Forbidden() {
  const { signOut } = useClerk();
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-seafoam-50 via-offwhite to-seafoam-100 px-4 text-center dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-seafoam-500 text-xl font-bold text-white shadow-lg shadow-seafoam-500/30">
        S
      </div>
      <p className="mt-8 text-7xl font-black text-seafoam-500">403</p>
      <h1 className="mt-4 text-2xl font-bold text-charcoal dark:text-white">
        You don't have permission to access this area.
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        If you believe this is a mistake, contact{" "}
        <a
          href="mailto:support@sweep-r.com"
          className="font-medium text-seafoam-600"
        >
          support@sweep-r.com
        </a>
        .
      </p>
      <Button
        className="mt-6"
        variant="secondary"
        onClick={() => signOut({ redirectUrl: "/sign-in" })}
      >
        Sign out
      </Button>
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
  const role = user?.publicMetadata?.role;
  if (role !== "admin" && role !== "super_admin") {
    return <Forbidden />;
  }
  return <>{children}</>;
}

/**
 * Renders a 403 page (not a redirect) for non-admins. Renders through when
 * Clerk is disabled so keyless dev/preview builds remain usable.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  if (!CLERK_ENABLED) return <>{children}</>;
  return <GuardInner>{children}</GuardInner>;
}
