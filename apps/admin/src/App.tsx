import { Routes, Route } from "react-router-dom";
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
} from "lucide-react";
import { AppShell } from "@sweepr/ui";
import { DashboardPage } from "./pages/DashboardPage";
import { JobsPage } from "./pages/JobsPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { CustomersPage } from "./pages/CustomersPage";
import { CleanersPage } from "./pages/CleanersPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { PricingPage } from "./pages/PricingPage";
import { DisputesPage } from "./pages/DisputesPage";
import { PayoutsPage } from "./pages/PayoutsPage";
import { SettingsPage } from "./pages/SettingsPage";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/cleaners", label: "Cleaners", icon: Sparkles },
  { to: "/applications", label: "Applications", icon: FileText },
  { to: "/pricing", label: "Pricing", icon: DollarSign },
  { to: "/disputes", label: "Disputes", icon: AlertTriangle },
  { to: "/payouts", label: "Payouts", icon: Wallet },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell brand="Admin" accent="Sweepr Ops" nav={nav}>
      {children}
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Shell><DashboardPage /></Shell>} />
      <Route path="/jobs" element={<Shell><JobsPage /></Shell>} />
      <Route path="/jobs/:id" element={<Shell><JobDetailPage /></Shell>} />
      <Route path="/customers" element={<Shell><CustomersPage /></Shell>} />
      <Route path="/cleaners" element={<Shell><CleanersPage /></Shell>} />
      <Route path="/applications" element={<Shell><ApplicationsPage /></Shell>} />
      <Route path="/pricing" element={<Shell><PricingPage /></Shell>} />
      <Route path="/disputes" element={<Shell><DisputesPage /></Shell>} />
      <Route path="/payouts" element={<Shell><PayoutsPage /></Shell>} />
      <Route path="/settings" element={<Shell><SettingsPage /></Shell>} />
    </Routes>
  );
}
