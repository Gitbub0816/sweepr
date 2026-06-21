import { Routes, Route, Navigate } from "react-router-dom";
import { CalendarCheck, CreditCard, User, Home as HomeIcon } from "lucide-react";
import { AppShell } from "@sweepr/ui";
import { BookingLayout } from "./booking/BookingLayout";
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

const nav = [
  { to: "/home", label: "Home", icon: HomeIcon, end: true },
  { to: "/book", label: "Book", icon: CalendarCheck },
  { to: "/bookings", label: "My Bookings", icon: CalendarCheck, end: true },
  { to: "/payment-methods", label: "Payment Methods", icon: CreditCard },
  { to: "/profile", label: "Profile", icon: User },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell brand="Customer" nav={nav}>
      {children}
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <OfflineIndicator />
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<Shell><Home /></Shell>} />

        {/* Booking flow (no sidebar — focused funnel) */}
        <Route element={<BookingLayout />}>
          <Route path="/book" element={<Navigate to="/book/address" replace />} />
          <Route path="/book/address" element={<AddressStep />} />
          <Route path="/book/home" element={<HomeStep />} />
          <Route path="/book/service" element={<ServiceStep />} />
          <Route path="/book/schedule" element={<ScheduleStep />} />
          <Route path="/book/review" element={<ReviewStep />} />
          <Route path="/book/payment" element={<PaymentStep />} />
        </Route>
        <Route path="/book/confirmed" element={<ConfirmedStep />} />

        {/* Account area */}
        <Route path="/bookings" element={<Shell><BookingsPage /></Shell>} />
        <Route path="/bookings/:id" element={<Shell><BookingDetailPage /></Shell>} />
        <Route path="/profile" element={<Shell><ProfilePage /></Shell>} />
        <Route
          path="/payment-methods"
          element={<Shell><PaymentMethodsPage /></Shell>}
        />
      </Routes>
    </ErrorBoundary>
  );
}
