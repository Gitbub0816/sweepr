/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useCallback, useEffect, useRef } from "react";
import { AuthenticateWithRedirectCallback, useAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { ContinueSignUp } from "./components/ContinueSignUp";
import {
  LayoutDashboard,
  Briefcase,
  CalendarDays,
  Wallet,
  User,
  BarChart3,
  GraduationCap,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import { AppShell, PrelaunchGate, ReportProblem, CookieConsent, PromoHost } from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "";

/** Floating "Report a problem" — shown on every authenticated cleaner flow. */
function ReportProblemMount() {
  const { isSignedIn, getToken } = useAuth();
  if (!isSignedIn) return null;
  return <ReportProblem app="cleaner" apiUrl={API_URL} getToken={getToken} />;
}

/** Site-wide promotion widget host (cleaner audience — e.g. Founding Member). */
function PromoHostMount() {
  const { isSignedIn, getToken } = useAuth();
  return (
    <PromoHost
      apiBase={API_URL}
      persona="cleaner"
      getToken={getToken}
      signedIn={Boolean(isSignedIn)}
      signInUrl="/sign-in"
    />
  );
}
import { HomePage } from "./pages/HomePage";
import { DashboardPage } from "./pages/DashboardPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PendingReviewPage } from "./pages/PendingReviewPage";
import { YardstikSimulatePage } from "./pages/YardstikSimulatePage";
import { JobsPage } from "./pages/JobsPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { SchedulePage } from "./pages/SchedulePage";
import { EarningsPage } from "./pages/EarningsPage";
import { PerformancePage } from "./pages/PerformancePage";
import { ProfilePage } from "./pages/ProfilePage";
import { TrainingPage } from "./pages/TrainingPage";
import { CourseViewerPage } from "./pages/CourseViewerPage";
import { InsurancePage } from "./pages/InsurancePage";
import { VerifyDonePage } from "./pages/VerifyDonePage";
import { SignInPage } from "./components/SignInPage";
import { SignUpPage } from "./components/SignUpPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { CENTRAL_AUTH_ENABLED, SessionProvider } from "./components/CentralSession";
import { OnboardingGuard } from "./components/OnboardingGuard";
import { NavAuth } from "./components/NavAuth";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/training", label: "Training", icon: GraduationCap },
  { to: "/courses", label: "Courses", icon: BookOpen },
  { to: "/jobs", label: "Job Board", icon: Briefcase },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/earnings", label: "Earnings", icon: Wallet },
  { to: "/performance", label: "Performance", icon: BarChart3 },
  { to: "/insurance", label: "Insurance", icon: ShieldCheck },
  { to: "/profile", label: "Profile", icon: User },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell brand="Cleaner" accent="Sweepr Pro" nav={nav} headerRight={<NavAuth />}>
      {children}
    </AppShell>
  );
}

/** Auth + onboarding-gated app page. jobsGated=true locks the page until approved. */
function Guarded({ children, jobsGated = false }: { children: React.ReactNode; jobsGated?: boolean }) {
  // Central-auth migration gate (see customer app): flag on → broker
  // SessionProvider validates the host-only session before any protected page
  // renders; flag off → the Clerk ProtectedRoute path is untouched.
  const Gate = CENTRAL_AUTH_ENABLED ? SessionProvider : ProtectedRoute;
  return (
    <Gate>
      <OnboardingGuard jobsGated={jobsGated}>
        <Shell>{children}</Shell>
      </OnboardingGuard>
    </Gate>
  );
}

const FORCE_PRELAUNCH = import.meta.env.VITE_PRELAUNCH_FORCE === "true";

function GateLayout() {
  return (
    <PrelaunchGate type="cleaner" apiUrl={API_URL} forcePrelaunch={FORCE_PRELAUNCH}>
      <Outlet />
    </PrelaunchGate>
  );
}

/**
 * Last-used language persistence — hard rule, no save button:
 *  - Every language switch is written to the server immediately, so
 *    users.preferred_language is always the LAST-USED language.
 *  - On sign-in, the server's last-used language is applied (unless the URL
 *    carries an explicit ?lang link, which wins and is itself persisted).
 * Note: the settings endpoint is a PUT (the old ?lang sync PATCHed it and
 * silently 404'd — fixed here).
 */
function LanguagePersistence() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { i18n } = useTranslation();
  const lastSynced = useRef<string | null>(null);

  const push = useCallback((code: string) => {
    if (lastSynced.current === code) return;
    lastSynced.current = code;
    const api = import.meta.env.VITE_API_URL ?? "";
    getToken().then((token) => {
      if (!token) return;
      fetch(`${api}/cleaner-dashboard/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preferred_language: code }),
      }).catch(() => null);
    });
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const onChange = (code: string) => push(code);
    i18n.on("languageChanged", onChange);
    return () => i18n.off("languageChanged", onChange);
  }, [isLoaded, isSignedIn, i18n, push]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const urlLang = new URLSearchParams(window.location.search).get("lang");
    if (urlLang) {
      push(urlLang);
      return;
    }
    const api = import.meta.env.VITE_API_URL ?? "";
    getToken().then((token) => {
      if (!token) return;
      fetch(`${api}/cleaner-dashboard/settings`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { preferred_language?: string | null } | null) => {
          const saved = d?.preferred_language;
          if (saved) {
            lastSynced.current = saved;
            if (saved !== i18n.language) void i18n.changeLanguage(saved);
          } else {
            push(i18n.language);
          }
        })
        .catch(() => null);
    });
  }, [isLoaded, isSignedIn, getToken, i18n, push]);

  return null;
}

export default function App() {
  return (
    <>
    <LanguagePersistence />
    <ReportProblemMount />
    <PromoHostMount />
    <CookieConsent />
    <Routes>
      {/* OAuth SSO callback and mock Yardstik form bypass the prelaunch gate */}
      <Route path="/sso-callback" element={<AuthenticateWithRedirectCallback continueSignUpUrl="/sign-up/continue" />} />
      <Route path="/sign-up/continue" element={<ContinueSignUp />} />
      <Route path="/yardstik-simulate" element={<YardstikSimulatePage />} />

      {/* Didit QR callback — phone lands here after completing verification */}
      <Route path="/verify-done" element={<VerifyDonePage />} />

      {/* Everything else is gated during prelaunch */}
      <Route element={<GateLayout />}>
      {/* Auth */}
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sign-up" element={<SignUpPage />} />

      {/* Onboarding (protected, but not onboarding-gated) */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pending"
        element={
          <ProtectedRoute>
            <PendingReviewPage />
          </ProtectedRoute>
        }
      />

      {/* Training (protected only — accessible during onboarding) */}
      <Route path="/training" element={<ProtectedRoute><TrainingPage /></ProtectedRoute>} />
      <Route path="/training/:moduleId" element={<ProtectedRoute><TrainingPage /></ProtectedRoute>} />

      {/* Courses (protected + onboarding-gated) */}
      <Route path="/courses" element={<Guarded><CourseViewerPage /></Guarded>} />
      <Route path="/courses/:id" element={<Guarded><CourseViewerPage /></Guarded>} />

      {/* App (protected + onboarding-gated) */}
      <Route path="/" element={<Guarded><DashboardPage /></Guarded>} />
      <Route path="/home" element={<Guarded><HomePage /></Guarded>} />
      <Route path="/jobs" element={<Guarded jobsGated><JobsPage /></Guarded>} />
      <Route path="/jobs/:id" element={<Guarded jobsGated><JobDetailPage /></Guarded>} />
      <Route path="/schedule" element={<Guarded jobsGated><SchedulePage /></Guarded>} />
      <Route path="/earnings" element={<Guarded><EarningsPage /></Guarded>} />
      <Route path="/performance" element={<Guarded><PerformancePage /></Guarded>} />
      {/* Insurance enrollment charges the cleaner and links Stripe payouts —
          gate it behind approval so a pending applicant can't enrol/pay early. */}
      <Route path="/insurance" element={<Guarded jobsGated><InsurancePage /></Guarded>} />
      <Route path="/profile" element={<Guarded><ProfilePage /></Guarded>} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Route>{/* end GateLayout */}
    </Routes>
    </>
  );
}
