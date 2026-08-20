/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { SignInPage } from "./components/SignInPage";
import { AccessControlPage } from "./pages/AccessControlPage";
import { usePermissions, ROUTE_SCREEN } from "./lib/permissions";
import { useAlertBadges } from "./lib/alerts";
import { AdminNotificationBell } from "./components/AdminNotificationBell";
import {
  KeyRound,
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
  Inbox,
  ScanEye,
  ShieldBan,
  Megaphone,
  Award,
  Gavel,
  CalendarClock,
  DoorOpen,
  Gauge,
  Orbit,
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
import { LegalArchivePage } from "./pages/LegalArchivePage";
import { DisputesPage } from "./pages/DisputesPage";
import { DisputeDetailPage } from "./pages/DisputeDetailPage";
import { PayoutsPage } from "./pages/PayoutsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ServiceAreasPage } from "./pages/ServiceAreasPage";
import { MapTestDirectionsPage } from "./pages/MapTestDirectionsPage";
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
import { PromotionsPage } from "./pages/PromotionsPage";
import { FoundingMembersPage } from "./pages/FoundingMembersPage";
import { SmartEntryPage } from "./pages/SmartEntryPage";
import { MailPage } from "./pages/MailPage";
import { ScopeReviewPage } from "./pages/ScopeReviewPage";
import { ScopeReviewDetailPage } from "./pages/ScopeReviewDetailPage";
import { TrustSafetyPage } from "./pages/TrustSafetyPage";

// Lazy: Site Analytics carries three.js (React Three Fiber KPIs) — keep it
// out of the main admin bundle.
const AnalyticsPage = lazy(() =>
  import("./pages/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })),
);

// Lazy: Pricing Studio is a large workspace only finance/admins open.
const PricingStudioPage = lazy(() =>
  import("./pages/PricingStudioPage").then((m) => ({ default: m.PricingStudioPage })),
);

function AnalyticsFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-sm text-slate-500">
      Loading analytics…
    </div>
  );
}

const navGroups = [
  {
    label: "Operations",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/jobs", label: "Jobs", icon: Briefcase },
      { to: "/scope-review", label: "Scope Review", icon: ScanEye },
      { to: "/disputes", label: "Disputes", icon: AlertTriangle },
      { to: "/service-areas", label: "Service Areas", icon: Map },
      { to: "/smart-entry", label: "Smart Entry", icon: DoorOpen },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/customers", label: "Customers", icon: Users },
      { to: "/cleaners", label: "Cleaners", icon: Sparkles },
      { to: "/applications", label: "Applications", icon: FileText },
      { to: "/insurance", label: "Insurance", icon: ShieldCheck },
      { to: "/founding-members", label: "Founding Members", icon: Award },
      { to: "/training", label: "Training", icon: GraduationCap },
      { to: "/courses", label: "Course Builder", icon: MonitorPlay },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/pricing", label: "Pricing", icon: DollarSign },
      { to: "/pricing-studio", label: "Pricing Studio", icon: Gauge },
      { to: "/payouts", label: "Payouts", icon: Wallet },
      { to: "/promotions", label: "Promotions", icon: Megaphone },
    ],
  },
  {
    label: "Comms",
    items: [
      { to: "/email", label: "Email", icon: Mail },
      { to: "/mail", label: "Mail", icon: Inbox },
      { to: "/notifications", label: "Notifications", icon: BellRing },
      { to: "/slack", label: "Slack", icon: Slack },
    ],
  },
  {
    label: "Trust & Safety",
    items: [
      { to: "/trust-safety", label: "Trust & Safety", icon: ShieldBan },
      { to: "/security", label: "Security", icon: ShieldAlert },
      { to: "/approvals", label: "Approvals", icon: GitPullRequest },
      { to: "/legal-archive", label: "Legal Archive", icon: Gavel },
    ],
  },
  {
    label: "Platform",
    items: [
      { to: "/analytics", label: "Site Analytics", icon: Orbit },
      { to: "/observability", label: "Observability", icon: Telescope },
      { to: "/errors", label: "Errors", icon: Bug },
      { to: "/events", label: "Events", icon: CalendarClock },
      { to: "/status", label: "Status", icon: Activity },
      { to: "/it-portal", label: "IT Portal", icon: LifeBuoy },
      { to: "/automation", label: "Automation", icon: Zap },
      { to: "/admins", label: "Admin Team", icon: Users2 },
      { to: "/access-control", label: "Access Control", icon: KeyRound },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { has } = usePermissions();
  const { pathCounts } = useAlertBadges();
  // Hide nav entries the signed-in admin can't access. (API still enforces.)
  const visibleGroups = navGroups
    .map((g) => ({
      ...g,
      items: g.items
        .filter((n) => {
          const key = ROUTE_SCREEN[n.to];
          return !key || has(key);
        })
        .map((n) => (pathCounts[n.to] ? { ...n, badge: pathCounts[n.to] } : n)),
    }))
    .filter((g) => g.items.length > 0);
  return (
    <AppShell
      brand="Admin"
      accent="Sweepr Ops"
      navGroups={visibleGroups}
      headerRight={
        <div className="flex items-center gap-1">
          <AdminNotificationBell />
          <NavAuth />
        </div>
      }
    >
      {children}
    </AppShell>
  );
}

/** Blocks a page whose screen permission the current admin lacks. */
function ScreenGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { loading, has } = usePermissions();
  // Longest-prefix match so /jobs/:id inherits /jobs's screen key.
  const match = Object.keys(ROUTE_SCREEN)
    .filter((r) => pathname === r || (r !== "/" && pathname.startsWith(r + "/")))
    .sort((a, b) => b.length - a.length)[0];
  const key = match ? ROUTE_SCREEN[match] : undefined;
  if (loading || !key || has(key)) return <>{children}</>;
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-lg font-bold text-charcoal dark:text-white">Access restricted</h1>
      <p className="mt-2 text-sm text-slate-500">
        You don't have permission to view this screen. Ask an administrator to grant it under
        Access Control.
      </p>
    </div>
  );
}

/** Auth + admin-role + per-user-permission gated page. */
function Guarded({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AdminGuard>
        <Shell><ScreenGate>{children}</ScreenGate></Shell>
      </AdminGuard>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />

      {/* Public, no auth required, token in query string */}
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
      <Route
        path="/pricing-studio"
        element={
          <Guarded>
            <Suspense fallback={<AnalyticsFallback />}>
              <PricingStudioPage />
            </Suspense>
          </Guarded>
        }
      />
      <Route path="/legal-archive" element={<Guarded><LegalArchivePage /></Guarded>} />
      <Route path="/cleaning-pricing" element={<Navigate to="/pricing?tab=home-cleaning" replace />} />
      <Route path="/pricing/rules/:id" element={<Guarded><PricingRulePage /></Guarded>} />
      <Route path="/pricing/approvals/:id" element={<Guarded><PricingApprovalDetailPage /></Guarded>} />
      <Route path="/disputes" element={<Guarded><DisputesPage /></Guarded>} />
      <Route path="/disputes/:id" element={<Guarded><DisputeDetailPage /></Guarded>} />
      <Route path="/insurance" element={<Guarded><InsurancePage /></Guarded>} />
      <Route path="/payouts" element={<Guarded><PayoutsPage /></Guarded>} />
      <Route path="/service-areas" element={<Guarded><ServiceAreasPage /></Guarded>} />
      {/* Internal QA tool — deliberately not in the nav. */}
      <Route path="/map_Test/directions/t-b-t" element={<Guarded><MapTestDirectionsPage /></Guarded>} />
      <Route path="/events" element={<Guarded><EventsPage /></Guarded>} />
      <Route path="/status" element={<Guarded><StatusPage /></Guarded>} />
      <Route path="/training" element={<Guarded><TrainingAdminPage /></Guarded>} />
      <Route path="/courses" element={<Guarded><CourseBuilderPage /></Guarded>} />
      {/* Editor is a full-screen takeover, auth + admin gated, but outside the AppShell. */}
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
      {/* Broadcasts & Newsletter now live as tabs of /email (owned by their real pages). */}
      <Route path="/broadcasts" element={<Navigate to="/email?tab=broadcasts" replace />} />
      <Route path="/newsletter" element={<Navigate to="/email?tab=newsletter" replace />} />
      {/* Schedule folds into Automation; Coupons folds into Promotions. */}
      <Route path="/schedule" element={<Navigate to="/automation?tab=schedule" replace />} />
      <Route path="/promotions" element={<Guarded><PromotionsPage /></Guarded>} />
      <Route path="/coupons" element={<Navigate to="/promotions?tab=coupons" replace />} />
      <Route path="/smart-entry" element={<Guarded><SmartEntryPage /></Guarded>} />
      <Route path="/founding-members" element={<Guarded><FoundingMembersPage /></Guarded>} />
      <Route path="/mail" element={<Guarded><MailPage /></Guarded>} />
      <Route
        path="/analytics"
        element={
          <Guarded>
            <Suspense fallback={<AnalyticsFallback />}>
              <AnalyticsPage />
            </Suspense>
          </Guarded>
        }
      />
      <Route path="/observability" element={<Guarded><ObservabilityPage /></Guarded>} />
      <Route path="/errors" element={<Guarded><ErrorsPage /></Guarded>} />
      <Route path="/it-portal" element={<Guarded><ITPortalPage /></Guarded>} />
      <Route path="/security" element={<Guarded><SecurityPage /></Guarded>} />
      <Route path="/notifications" element={<Guarded><NotificationsPage /></Guarded>} />
      <Route path="/slack" element={<Guarded><SlackPage /></Guarded>} />
      <Route path="/approvals" element={<Guarded><ApprovalsPage /></Guarded>} />
      <Route path="/approvals/:id" element={<Guarded><ApprovalDetailPage /></Guarded>} />
      <Route path="/scope-review" element={<Guarded><ScopeReviewPage /></Guarded>} />
      <Route path="/scope-review/:id" element={<Guarded><ScopeReviewDetailPage /></Guarded>} />
      <Route path="/trust-safety" element={<Guarded><TrustSafetyPage /></Guarded>} />
      <Route path="/automation" element={<Guarded><AutomationPage /></Guarded>} />
      <Route path="/admins" element={<Guarded><AdminsPage /></Guarded>} />
      <Route path="/access-control" element={<Guarded><AccessControlPage /></Guarded>} />
      <Route path="/settings" element={<Guarded><SettingsPage /></Guarded>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
