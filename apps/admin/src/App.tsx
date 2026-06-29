import { Routes, Route } from "react-router-dom";
import { SignInPage } from "./components/SignInPage";
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
  Mail,
  GraduationCap,
  MonitorPlay,
  ShieldCheck,
  Telescope,
  Zap,
  Users2,
  Bug,
  LifeBuoy,
  BellRing,
  Slack,
  GitPullRequest,
  ShieldAlert,
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
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminGuard } from "./components/AdminGuard";
import { NavAuth } from "./components/NavAuth";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { EmailPage } from "./pages/EmailPage";
import { CourseBuilderPage } from "./pages/CourseBuilderPage";
import { CourseEditorPage } from "./pages/CourseEditorPage";
import { InsurancePage } from "./pages/InsurancePage";
import { ObservabilityPage } from "./pages/ObservabilityPage";
import { AdminsPage } from "./pages/AdminsPage";
import { AutomationPage } from "./pages/AutomationPage";
import { ErrorsPage } from "./pages/ErrorsPage";
import { ITPortalPage } from "./pages/ITPortalPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { SlackPage } from "./pages/SlackPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { ApprovalDetailPage } from "./pages/ApprovalDetailPage";
import { PricingRulePage } from "./pages/PricingRulePage";
import { PricingApprovalDetailPage } from "./pages/PricingApprovalDetailPage";
import { SecurityPage } from "./pages/SecurityPage";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/cleaners", label: "Cleaners", icon: Sparkles },
  { to: "/applications", label: "Applications", icon: FileText },
  { to: "/pricing", label: "Pricing", icon: DollarSign },
  { to: "/approvals", label: "Approvals", icon: GitPullRequest },
  { to: "/insurance", label: "Insurance", icon: ShieldCheck },
  { to: "/disputes", label: "Disputes", icon: AlertTriangle },
  { to: "/payouts", label: "Payouts", icon: Wallet },
  { to: "/service-areas", label: "Service Areas", icon: Map },
  { to: "/events", label: "Events", icon: Activity },
  { to: "/status", label: "Status", icon: Activity },
  { to: "/training", label: "Training", icon: GraduationCap },
  { to: "/courses", label: "Course Builder", icon: MonitorPlay },
  { to: "/email", label: "Email", icon: Mail },
  { to: "/observability", label: "Observability", icon: Telescope },
  { to: "/errors", label: "Errors", icon: Bug },
  { to: "/it-portal", label: "IT Portal", icon: LifeBuoy },
  { to: "/security", label: "Security", icon: ShieldAlert },
  { to: "/notifications", label: "Notifications", icon: BellRing },
  { to: "/slack", label: "Slack", icon: Slack },
  { to: "/automation", label: "Automation", icon: Zap },
  { to: "/admins", label: "Admin Team", icon: Users2 },
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
      <Route path="/sign-in" element={<SignInPage />} />

      {/* Public — no auth required, token in query string */}
      <Route path="/accept-invite" element={<AcceptInvitePage />} />

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
      <Route path="/pricing/rules/:id" element={<Guarded><PricingRulePage /></Guarded>} />
      <Route path="/pricing/approvals/:id" element={<Guarded><PricingApprovalDetailPage /></Guarded>} />
      <Route path="/disputes" element={<Guarded><DisputesPage /></Guarded>} />
      <Route path="/disputes/:id" element={<Guarded><DisputeDetailPage /></Guarded>} />
      <Route path="/insurance" element={<Guarded><InsurancePage /></Guarded>} />
      <Route path="/payouts" element={<Guarded><PayoutsPage /></Guarded>} />
      <Route path="/service-areas" element={<Guarded><ServiceAreasPage /></Guarded>} />
      <Route path="/events" element={<Guarded><EventsPage /></Guarded>} />
      <Route path="/status" element={<Guarded><StatusPage /></Guarded>} />
      <Route path="/training" element={<Guarded><TrainingAdminPage /></Guarded>} />
      <Route path="/courses" element={<Guarded><CourseBuilderPage /></Guarded>} />
      {/* Editor is a full-screen takeover — auth + admin gated, but outside the AppShell. */}
      <Route
        path="/courses/:id"
        element={
          <ProtectedRoute>
            <AdminGuard>
              <CourseEditorPage />
            </AdminGuard>
          </ProtectedRoute>
        }
      />
      <Route path="/email" element={<Guarded><EmailPage /></Guarded>} />
      <Route path="/observability" element={<Guarded><ObservabilityPage /></Guarded>} />
      <Route path="/errors" element={<Guarded><ErrorsPage /></Guarded>} />
      <Route path="/it-portal" element={<Guarded><ITPortalPage /></Guarded>} />
      <Route path="/security" element={<Guarded><SecurityPage /></Guarded>} />
      <Route path="/notifications" element={<Guarded><NotificationsPage /></Guarded>} />
      <Route path="/slack" element={<Guarded><SlackPage /></Guarded>} />
      <Route path="/approvals" element={<Guarded><ApprovalsPage /></Guarded>} />
      <Route path="/approvals/:id" element={<Guarded><ApprovalDetailPage /></Guarded>} />
      <Route path="/automation" element={<Guarded><AutomationPage /></Guarded>} />
      <Route path="/admins" element={<Guarded><AdminsPage /></Guarded>} />
      <Route path="/settings" element={<Guarded><SettingsPage /></Guarded>} />
    </Routes>
  );
}
