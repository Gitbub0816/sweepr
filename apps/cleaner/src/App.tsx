import { Routes, Route } from "react-router-dom";
import {
  LayoutDashboard,
  Briefcase,
  CalendarDays,
  Wallet,
  User,
} from "lucide-react";
import { AppShell } from "@sweepr/ui";
import { HomePage } from "./pages/HomePage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { JobsPage } from "./pages/JobsPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { SchedulePage } from "./pages/SchedulePage";
import { EarningsPage } from "./pages/EarningsPage";
import { ProfilePage } from "./pages/ProfilePage";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/jobs", label: "Job Board", icon: Briefcase },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/earnings", label: "Earnings", icon: Wallet },
  { to: "/profile", label: "Profile", icon: User },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell brand="Cleaner" accent="Sweepr Pro" nav={nav}>
      {children}
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/" element={<Shell><HomePage /></Shell>} />
      <Route path="/jobs" element={<Shell><JobsPage /></Shell>} />
      <Route path="/jobs/:id" element={<Shell><JobDetailPage /></Shell>} />
      <Route path="/schedule" element={<Shell><SchedulePage /></Shell>} />
      <Route path="/earnings" element={<Shell><EarningsPage /></Shell>} />
      <Route path="/profile" element={<Shell><ProfilePage /></Shell>} />
    </Routes>
  );
}
