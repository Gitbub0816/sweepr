import { Routes, Route } from "react-router-dom";
import { SignIn, SignUp } from "@clerk/clerk-react";
import {
  LayoutDashboard,
  Briefcase,
  CalendarDays,
  Wallet,
  User,
  BarChart3,
  GraduationCap,
} from "lucide-react";
import { AppShell, PrelaunchGate } from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "";
import { HomePage } from "./pages/HomePage";
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
import { AuthPage } from "./components/AuthPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { OnboardingGuard } from "./components/OnboardingGuard";
import { NavAuth } from "./components/NavAuth";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/training", label: "Training", icon: GraduationCap },
  { to: "/jobs", label: "Job Board", icon: Briefcase },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/earnings", label: "Earnings", icon: Wallet },
  { to: "/performance", label: "Performance", icon: BarChart3 },
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

export default function App() {
  return (
    <Routes>
      {/* Auth (unprotected, but gated during prelaunch) */}
      <Route
        path="/sign-in/*"
        element={
          <PrelaunchGate type="cleaner" apiUrl={API_URL}>
            <AuthPage title="Welcome back" subtitle="Sign in to your Sweepr Pro account">
              <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/" />
            </AuthPage>
          </PrelaunchGate>
        }
      />
      <Route
        path="/sign-up/*"
        element={
          <PrelaunchGate type="cleaner" apiUrl={API_URL}>
            <AuthPage title="Become a Sweepr Pro" subtitle="Start earning on your schedule">
              <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/onboarding" />
            </AuthPage>
          </PrelaunchGate>
        }
      />

      {/* Mock Checkr hosted form (no auth required — loaded in iframe) */}
      <Route path="/checkr-simulate" element={<CheckrSimulatePage />} />

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

      {/* Training (protected + onboarding-gated) */}
      <Route path="/training" element={<Guarded><TrainingPage /></Guarded>} />
      <Route path="/training/:moduleId" element={<Guarded><TrainingPage /></Guarded>} />

      {/* App (protected + onboarding-gated) */}
      <Route path="/" element={<Guarded><HomePage /></Guarded>} />
      <Route path="/jobs" element={<Guarded><JobsPage /></Guarded>} />
      <Route path="/jobs/:id" element={<Guarded><JobDetailPage /></Guarded>} />
      <Route path="/schedule" element={<Guarded><SchedulePage /></Guarded>} />
      <Route path="/earnings" element={<Guarded><EarningsPage /></Guarded>} />
      <Route path="/performance" element={<Guarded><PerformancePage /></Guarded>} />
      <Route path="/profile" element={<Guarded><ProfilePage /></Guarded>} />
    </Routes>
  );
}
