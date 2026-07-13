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
import { ProtectedRoute } from "./components/ProtectedRoute";
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
  return (
    <ProtectedRoute>
      <AppShell brand="Business" nav={nav} headerRight={<UserButton afterSignOutUrl="/sign-in" />}>
        {children}
      </AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        <Route path="/claim" element={<ClaimPage />} />
        <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
        <Route path="/properties" element={<Protected><PropertiesPage /></Protected>} />
        <Route path="/members" element={<Protected><MembersPage /></Protected>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
