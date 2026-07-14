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
import { CENTRAL_AUTH_ENABLED, SessionProvider } from "./CentralSession";
import { useAuth } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import { SweeprLoaderScreen } from "@sweepr/ui";

function ClerkProtected({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <SweeprLoaderScreen />
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
  // Central-auth flag on → every protected route, including ones that mount
  // ProtectedRoute directly (booking flow, onboarding), goes through the
  // broker session gate instead of Clerk.
  if (CENTRAL_AUTH_ENABLED) return <SessionProvider>{children}</SessionProvider>;
  return <ClerkProtected>{children}</ClerkProtected>;
}
