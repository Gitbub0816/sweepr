import type { ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import { LoadingState } from "@sweepr/ui";

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
 * Gates a route behind Clerk authentication. Always enforces auth regardless
 * of whether a Clerk publishable key is configured.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  return <ClerkProtected>{children}</ClerkProtected>;
}
