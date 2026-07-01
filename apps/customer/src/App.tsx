import { Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import { SignInPage } from "./components/SignInPage";
import { SignUpPage } from "./components/SignUpPage";
import { ContinueSignUp } from "./components/ContinueSignUp";
import {
  CalendarCheck,
  CreditCard,
  User,
  Home as HomeIcon,
  Repeat,
} from "lucide-react";
import { AppShell, PrelaunchGate, ReportProblem } from "@sweepr/ui";
import { useAuth } from "@clerk/clerk-react";
import { OnboardingPage } from "./pages/OnboardingPage";
import { useCustomerProfile } from "./data/profile";

const API_URL = import.meta.env.VITE_API_URL ?? "";

/** Floating "Report a problem" — shown on every authenticated customer flow. */
function ReportProblemMount() {
  const { isSignedIn, getToken } = useAuth();
  if (!isSignedIn) return null;
  return <ReportProblem app="customer" apiUrl={API_URL} getToken={getToken} />;
}

import { BookingLayout } from "./booking/BookingLayout";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { AddressStep } from "./booking/steps/AddressStep";
import { HomeStep } from "./booking/steps/HomeStep";
import { ServiceStep } from "./booking/steps/ServiceStep";
import { ScheduleStep } from "./booking/steps/ScheduleStep";
import { ReviewStep } from "./booking/steps/ReviewStep";
import { PaymentStep } from "./booking/steps/PaymentStep";
import { ConfirmedStep } from "./booking/steps/ConfirmedStep";
import { BookingsPage } from "./pages/BookingsPage";
import { BookingDetailPage } from "./pages/BookingDetailPage";
import { ProfilePage } from "./pages/ProfilePage";
import { PaymentMethodsPage } from "./pages/PaymentMethodsPage";
import { Home } from "./pages/Home";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { NavAuth } from "./components/NavAuth";

const nav = [
  { to: "/home", label: "Home", icon: HomeIcon, end: true },
  { to: "/book", label: "Book", icon: CalendarCheck },
  { to: "/bookings", label: "My Bookings", icon: CalendarCheck, end: true },
  { to: "/subscriptions", label: "Subscriptions", icon: Repeat },
  { to: "/payment-methods", label: "Payment Methods", icon: CreditCard },
  { to: "/profile", label: "Profile", icon: User },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell brand="Customer" nav={nav} headerRight={<NavAuth />}>
      {children}
    </AppShell>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Shell>{children}</Shell>
    </ProtectedRoute>
  );
}

/** Checks if the user has completed onboarding; if not, redirects to /onboarding. */
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const { data, loading } = useCustomerProfile();
  const location = useLocation();

  if (!isLoaded || (isSignedIn && loading)) return null;
  if (!isSignedIn) return <>{children}</>;

  // After profile loads, if not yet onboarded, redirect to onboarding.
  // Exempts /onboarding itself to avoid redirect loops.
  if (data && !data.profile.onboarded && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

const FORCE_PRELAUNCH = import.meta.env.VITE_PRELAUNCH_FORCE === "true";

/** On first load, if ?lang= is in the URL, persist it to the user's profile. */
function LangSync() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const code = new URLSearchParams(window.location.search).get("lang");
    if (!code) return;
    const api = import.meta.env.VITE_API_URL ?? "";
    getToken().then((token) => {
      if (!token) return;
      fetch(`${api}/customer-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preferredLanguage: code }),
      }).catch(() => null);
    });
  }, [isLoaded, isSignedIn, getToken]);
  return null;
}

function GateLayout() {
  return (
    <PrelaunchGate type="customer" apiUrl={API_URL} forcePrelaunch={FORCE_PRELAUNCH}>
      <OnboardingGate>
        <Outlet />
      </OnboardingGate>
    </PrelaunchGate>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LangSync />
      <OfflineIndicator />
      <ReportProblemMount />
      <Routes>
        {/* OAuth SSO callback — outside prelaunch gate, handles token exchange */}
        <Route path="/sso-callback" element={<AuthenticateWithRedirectCallback continueSignUpUrl="/sign-up/continue" />} />

        {/* Auth routes — outside gate so sign-in is always accessible */}
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/sign-up/continue" element={<ContinueSignUp />} />

        {/* Onboarding — protected but outside prelaunch gate */}
        <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />

        <Route element={<GateLayout />}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Protected><Home /></Protected>} />

          {/* Booking flow (no sidebar — focused funnel) — auth required */}
          <Route element={<ProtectedRoute><BookingLayout /></ProtectedRoute>}>
            <Route path="/book" element={<Navigate to="/book/address" replace />} />
            <Route path="/book/address" element={<AddressStep />} />
            <Route path="/book/home" element={<HomeStep />} />
            <Route path="/book/service" element={<ServiceStep />} />
            <Route path="/book/schedule" element={<ScheduleStep />} />
            <Route path="/book/review" element={<ReviewStep />} />
            <Route path="/book/payment" element={<PaymentStep />} />
          </Route>
          <Route
            path="/book/confirmed"
            element={<ProtectedRoute><ConfirmedStep /></ProtectedRoute>}
          />

          {/* Account area — auth required */}
          <Route path="/bookings" element={<Protected><BookingsPage /></Protected>} />
          <Route
            path="/bookings/:id"
            element={<Protected><BookingDetailPage /></Protected>}
          />
          <Route
            path="/subscriptions"
            element={<Protected><SubscriptionsPage /></Protected>}
          />
          <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
          <Route
            path="/payment-methods"
            element={<Protected><PaymentMethodsPage /></Protected>}
          />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
