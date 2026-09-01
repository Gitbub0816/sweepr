/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Navigate, useLocation } from "react-router";
import { useAuth } from "@clerk/clerk-react";
import { SweeprLoaderScreen } from "@sweepr/ui";
import { CENTRAL_AUTH_ENABLED, SessionProvider } from "./CentralSession";

function ClerkProtected({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return <SweeprLoaderScreen />;
  }
  if (!isSignedIn) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // Central-auth flag on → the broker session gate replaces Clerk gating.
  // ClerkProtected calls useAuth(), which would throw with no ClerkProvider
  // mounted (central-auth builds skip it), so the branch happens up here.
  if (CENTRAL_AUTH_ENABLED) return <SessionProvider>{children}</SessionProvider>;
  return <ClerkProtected>{children}</ClerkProtected>;
}
