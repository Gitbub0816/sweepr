/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Routes, Route, Navigate } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { LayoutDashboard, Home as HomeIcon, Users } from "lucide-react";
import { AppShell } from "@sweepr/ui";
import { BusinessLogo } from "./components/BusinessLogo";
import { ProtectedRoute } from "./components/ProtectedRoute";
import {
  CENTRAL_AUTH_ENABLED,
  CentralSignOutButton,
  SessionProvider,
} from "./components/CentralSession";
import { SignInPage } from "./pages/SignInPage";
import { SignUpPage } from "./pages/SignUpPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PropertiesPage } from "./pages/PropertiesPage";
import { MembersPage } from "./pages/MembersPage";
import { ClaimPage } from "./pages/ClaimPage";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/properties", label: "Properties", icon: HomeIcon },
  { to: "/members", label: "Members", icon: Users },
];

function Protected({ children }: { children: React.ReactNode }) {
  // Explicit migration gate: exactly one auth path is active. Central auth on
  // → the broker SessionProvider gates every protected page (introspection
  // before any data fetch or PII render); off → Clerk gating, untouched.
  const Gate = CENTRAL_AUTH_ENABLED ? SessionProvider : ProtectedRoute;
  return (
    <Gate>
      <AppShell
        brand="Business"
        nav={nav}
        logo={<BusinessLogo size="sm" />}
        navActiveClass="bg-platinum-50 text-platinum-800 dark:bg-platinum-900/30 dark:text-platinum-300"
        headerRight={
          CENTRAL_AUTH_ENABLED ? <CentralSignOutButton /> : <UserButton afterSignOutUrl="/sign-in" />
        }
      >
        {children}
      </AppShell>
    </Gate>
  );
}

/** Central-auth mode has no in-app sign-in page — the BFF owns the ceremony. */
function RedirectToCentralLogin() {
  window.location.assign("/auth/login");
  return null;
}

export default function App() {
  return (
    <Routes>
        <Route
          path="/sign-in/*"
          element={CENTRAL_AUTH_ENABLED ? <RedirectToCentralLogin /> : <SignInPage />}
        />
        <Route
          path="/sign-up/*"
          element={CENTRAL_AUTH_ENABLED ? <RedirectToCentralLogin /> : <SignUpPage />}
        />
        <Route path="/claim" element={<ClaimPage />} />
        <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
        <Route path="/properties" element={<Protected><PropertiesPage /></Protected>} />
        <Route path="/members" element={<Protected><MembersPage /></Protected>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
