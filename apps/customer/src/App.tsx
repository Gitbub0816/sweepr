import { Routes, Route, Navigate } from "react-router-dom";
import { SignIn, SignUp } from "@clerk/clerk-react";
import {
  CalendarCheck,
  CreditCard,
  User,
  Home as HomeIcon,
  Repeat,
} from "lucide-react";
import { useState } from "react";
import { AppShell, SMSOptIn, PrelaunchGate } from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "";
import { BookingLayout } from "./booking/BookingLayout";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";

/** SMS consent shown alongside customer sign-up (TCPA — never pre-checked). */
function SignUpWithSms({ children }: { children: React.ReactNode }) {
  const [opted, setOpted] = useState(false);
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      {children}
      <SMSOptIn value={opted} onChange={setOpted} />
    </div>
  );
}
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
import { AuthPage } from "./components/AuthPage";
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

export default function App() {
  return (
    <ErrorBoundary>
      <OfflineIndicator />
      <Routes>
        {/* Auth */}
        <Route
          path="/sign-in/*"
          element={
            <PrelaunchGate type="customer" apiUrl={API_URL}>
              <AuthPage title="Welcome back" subtitle="Sign in to manage your cleans">
                <SignIn
                  routing="path"
                  path="/sign-in"
                  signUpUrl="/sign-up"
                  fallbackRedirectUrl="/book"
                />
              </AuthPage>
            </PrelaunchGate>
          }
        />
        <Route
          path="/sign-up/*"
          element={
            <PrelaunchGate type="customer" apiUrl={API_URL}>
              <AuthPage
                title="Create your account"
                subtitle="Book your first clean in minutes"
              >
                <SignUpWithSms>
                  <SignUp
                    routing="path"
                    path="/sign-up"
                    signInUrl="/sign-in"
                    fallbackRedirectUrl="/book"
                  />
                </SignUpWithSms>
              </AuthPage>
            </PrelaunchGate>
          }
        />

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
      </Routes>
    </ErrorBoundary>
  );
}
