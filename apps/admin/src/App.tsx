import { Routes, Route } from "react-router-dom";
import { SignIn } from "@clerk/clerk-react";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Sparkles,
  FileText,
  DollarSign,
  AlertTriangle,
  Wallet,
  Settings,
  Map,
  Activity,
  GraduationCap,
} from "lucide-react";
import { AppShell } from "@sweepr/ui";
import { DashboardPage } from "./pages/DashboardPage";
import { JobsPage } from "./pages/JobsPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { CustomersPage } from "./pages/CustomersPage";
import { CleanersPage } from "./pages/CleanersPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { ApplicationDetailPage } from "./pages/ApplicationDetailPage";
import { PricingPage } from "./pages/PricingPage";
import { DisputesPage } from "./pages/DisputesPage";
import { DisputeDetailPage } from "./pages/DisputeDetailPage";
import { PayoutsPage } from "./pages/PayoutsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ServiceAreasPage } from "./pages/ServiceAreasPage";
import { EventsPage } from "./pages/EventsPage";
import { StatusPage } from "./pages/StatusPage";
import { TrainingAdminPage } from "./pages/TrainingAdminPage";
import { AuthPage } from "./components/AuthPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminGuard } from "./components/AdminGuard";
import { NavAuth } from "./components/NavAuth";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/cleaners", label: "Cleaners", icon: Sparkles },
  { to: "/applications", label: "Applications", icon: FileText },
  { to: "/pricing", label: "Pricing", icon: DollarSign },
  { to: "/disputes", label: "Disputes", icon: AlertTriangle },
  { to: "/payouts", label: "Payouts", icon: Wallet },
  { to: "/service-areas", label: "Service Areas", icon: Map },
  { to: "/events", label: "Events", icon: Activity },
  { to: "/status", label: "Status", icon: Activity },
  { to: "/training", label: "Training", icon: GraduationCap },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell brand="Admin" accent="Sweepr Ops" nav={nav} headerRight={<NavAuth />}>
      {children}
    </AppShell>
  );
}

/** Auth + admin-role gated page. */
function Guarded({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AdminGuard>
        <Shell>{children}</Shell>
      </AdminGuard>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/sign-in/*"
        element={
          <AuthPage title="Sweepr Ops" subtitle="Sign in to the admin console">
            <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/" />
          </AuthPage>
        }
      />

      <Route path="/" element={<Guarded><DashboardPage /></Guarded>} />
      <Route path="/jobs" element={<Guarded><JobsPage /></Guarded>} />
      <Route path="/jobs/:id" element={<Guarded><JobDetailPage /></Guarded>} />
      <Route path="/customers" element={<Guarded><CustomersPage /></Guarded>} />
      <Route path="/cleaners" element={<Guarded><CleanersPage /></Guarded>} />
      <Route path="/applications" element={<Guarded><ApplicationsPage /></Guarded>} />
      <Route
        path="/applications/:id"
        element={<Guarded><ApplicationDetailPage /></Guarded>}
      />
      <Route path="/pricing" element={<Guarded><PricingPage /></Guarded>} />
      <Route path="/disputes" element={<Guarded><DisputesPage /></Guarded>} />
      <Route path="/disputes/:id" element={<Guarded><DisputeDetailPage /></Guarded>} />
      <Route path="/payouts" element={<Guarded><PayoutsPage /></Guarded>} />
      <Route path="/service-areas" element={<Guarded><ServiceAreasPage /></Guarded>} />
      <Route path="/events" element={<Guarded><EventsPage /></Guarded>} />
      <Route path="/status" element={<Guarded><StatusPage /></Guarded>} />
      <Route path="/training" element={<Guarded><TrainingAdminPage /></Guarded>} />
      <Route path="/settings" element={<Guarded><SettingsPage /></Guarded>} />
    </Routes>
  );
}
