import type { ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import { LoadingState } from "@sweepr/ui";

const CLERK_ENABLED = Boolean(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
);

function ClerkProtected({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <LoadingState rows={4} />
      </div>
    );
  }
  if (!isSignedIn) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

/**
 * Gates a route behind Clerk authentication. When no Clerk key is configured
 * (keyless dev/preview builds) the route renders through so the app remains
 * usable locally.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!CLERK_ENABLED) return <>{children}</>;
  return <ClerkProtected>{children}</ClerkProtected>;
}
