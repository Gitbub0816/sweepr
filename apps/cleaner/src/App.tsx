import { Routes, Route, Outlet } from "react-router-dom";
import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
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
import { AppShell, PrelaunchGate } from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "";
import { HomePage } from "./pages/HomePage";
import { DashboardPage } from "./pages/DashboardPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PendingReviewPage } from "./pages/PendingReviewPage";
import { CheckrSimulatePage } from "./pages/CheckrSimulatePage";
import { JobsPage } from "./pages/JobsPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { SchedulePage } from "./pages/SchedulePage";
import { EarningsPage } from "./pages/EarningsPage";
import { PerformancePage } from "./pages/PerformancePage";
import { ProfilePage } from "./pages/ProfilePage";
import { TrainingPage } from "./pages/TrainingPage";
import { CourseViewerPage } from "./pages/CourseViewerPage";
import { InsurancePage } from "./pages/InsurancePage";
import { SignInPage } from "./components/SignInPage";
import { SignUpPage } from "./components/SignUpPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
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

/** Auth + onboarding-gated app page. */
function Guarded({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <OnboardingGuard>
        <Shell>{children}</Shell>
      </OnboardingGuard>
    </ProtectedRoute>
  );
}

function GateLayout() {
  return (
    <PrelaunchGate type="cleaner" apiUrl={API_URL}>
      <Outlet />
    </PrelaunchGate>
  );
}

export default function App() {
  return (
    <Routes>
      {/* OAuth SSO callback and mock Checkr form bypass the prelaunch gate */}
      <Route path="/sso-callback" element={<AuthenticateWithRedirectCallback />} />
      <Route path="/checkr-simulate" element={<CheckrSimulatePage />} />

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
      <Route path="/jobs" element={<Guarded><JobsPage /></Guarded>} />
      <Route path="/jobs/:id" element={<Guarded><JobDetailPage /></Guarded>} />
      <Route path="/schedule" element={<Guarded><SchedulePage /></Guarded>} />
      <Route path="/earnings" element={<Guarded><EarningsPage /></Guarded>} />
      <Route path="/performance" element={<Guarded><PerformancePage /></Guarded>} />
      <Route path="/insurance" element={<Guarded><InsurancePage /></Guarded>} />
      <Route path="/profile" element={<Guarded><ProfilePage /></Guarded>} />
      </Route>{/* end GateLayout */}
    </Routes>
  );
}
