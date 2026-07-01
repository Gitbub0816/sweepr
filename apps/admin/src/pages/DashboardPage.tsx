import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  Briefcase,
  DollarSign,
  Sparkles,
  FileText,
  Users,
  AlertTriangle,
  MapPin,
  Mail,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { DashboardShell, StatCard, Card, Badge, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const SEAFOAM = ["#2DD4BF", "#14B8A6", "#0D9488", "#0F766E", "#134E4A", "#99F6E4"];

const STATUS_COLOR: Record<string, string> = {
  matching: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  in_progress: "bg-seafoam-100 text-seafoam-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled_by_customer: "bg-slate-100 text-slate-500",
  cancelled_by_cleaner: "bg-slate-100 text-slate-500",
  disputed: "bg-red-100 text-red-700",
};

interface DashboardData {
  stats: {
    total_bookings: number;
    bookings_today: number;
    pending_cleaners: number;
    active_cleaners: number;
    total_cleaners: number;
    open_disputes: number;
    total_disputes: number;
    total_customers: number;
    total_revenue_cents: number;
    revenue_today_cents: number;
  };
  bookingsByStatus: Array<{ status: string; count: number }>;
  recentBookings: Array<{
    id: string;
    status: string;
    service_type: string;
    scheduled_for: string;
    created_at: string;
    customer_email: string | null;
    cleaner_name: string | null;
  }>;
  recentAudit: Array<{
    action: string;
    actor_clerk_id: string;
    target_type: string;
    target_id: string;
    created_at: string;
  }>;
  waitlistCount: number;
  newsletterCount: number;
  cityRequestCount: number;
}

function actionVariant(action: string): "error" | "success" | "info" | "warning" {
  if (action.includes("dispute") || action.includes("suspend") || action.includes("reject") || action.startsWith("data.")) return "error";
  if (action.startsWith("payment") || action.startsWith("payout")) return "success";
  if (action.startsWith("booking")) return "info";
  return "warning";
}

const POSTHOG_DASHBOARD_URL = import.meta.env.VITE_POSTHOG_DASHBOARD_URL as string | undefined;
// Only treat the embed URL as usable if it looks like a PostHog shared/embedded
// dashboard. A stale or revoked share link makes PostHog's own iframe code fall
// back to a placeholder token ("fake_token") and spam 404/401s, so we never
// auto-load it — the operator clicks to load it explicitly.
const DASHBOARD_URL_VALID =
  !!POSTHOG_DASHBOARD_URL &&
  /^https:\/\/(us|eu|app)\.posthog\.com\/(shared|embedded)\//.test(POSTHOG_DASHBOARD_URL);

export function DashboardPage() {
  const { getToken } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setData(await res.json() as DashboardData);
      } else {
        toast.error("Failed to load dashboard data");
      }
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  const s = data?.stats;
  const pieData = (data?.bookingsByStatus ?? []).map((r) => ({ name: r.status, value: r.count }));

  return (
    <DashboardShell
      title="Dashboard"
      description="Live platform overview — data from Neon."
      actions={
        <button
          onClick={() => void load(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-seafoam-400 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Primary stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Bookings today"
              value={String(s?.bookings_today ?? 0)}
              icon={Briefcase}
              delta={s?.total_bookings ? `${s.total_bookings} total` : undefined}
            />
            <StatCard
              label="Revenue today"
              value={formatCurrency((s?.revenue_today_cents ?? 0) / 100)}
              icon={DollarSign}
              delta={s?.total_revenue_cents ? formatCurrency(s.total_revenue_cents / 100) + " total" : undefined}
              deltaPositive
            />
            <StatCard
              label="Active cleaners"
              value={String(s?.active_cleaners ?? 0)}
              icon={Sparkles}
              delta={`${s?.pending_cleaners ?? 0} pending`}
            />
            <StatCard
              label="Pending applications"
              value={String(s?.pending_cleaners ?? 0)}
              icon={FileText}
            />
          </div>

          {/* Secondary stats */}
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Total customers", value: s?.total_customers ?? 0, icon: Users },
              { label: "Open disputes", value: s?.open_disputes ?? 0, icon: AlertTriangle },
              { label: "Total cleaners", value: s?.total_cleaners ?? 0, icon: Sparkles },
              { label: "Waitlist", value: data?.waitlistCount ?? 0, icon: FileText },
              { label: "Newsletter", value: data?.newsletterCount ?? 0, icon: Mail },
              { label: "City requests", value: data?.cityRequestCount ?? 0, icon: MapPin },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
              >
                <item.icon className="mb-2 h-4 w-4 text-seafoam-500" />
                <p className="text-2xl font-bold text-charcoal dark:text-white">{item.value}</p>
                <p className="text-xs text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Jobs by status pie */}
            <Card>
              <h2 className="mb-4 font-semibold text-charcoal dark:text-white">Bookings by status</h2>
              {pieData.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No bookings yet.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                        {pieData.map((_, i) => <Cell key={i} fill={SEAFOAM[i % SEAFOAM.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Cleaner status bar chart */}
            <Card>
              <h2 className="mb-4 font-semibold text-charcoal dark:text-white">Growth signals</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: "Cleaners", approved: s?.active_cleaners ?? 0, pending: s?.pending_cleaners ?? 0 },
                      { name: "Disputes", open: s?.open_disputes ?? 0, total: s?.total_disputes ?? 0 },
                    ]}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="approved" name="Approved" fill={SEAFOAM[0]} radius={[0, 6, 6, 0]} stackId="a" />
                    <Bar dataKey="pending" name="Pending" fill={SEAFOAM[3]} radius={[0, 6, 6, 0]} stackId="a" />
                    <Bar dataKey="open" name="Open" fill="#f97316" radius={[0, 6, 6, 0]} stackId="b" />
                    <Bar dataKey="total" name="Total" fill={SEAFOAM[2]} radius={[0, 6, 6, 0]} stackId="b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Recent bookings */}
          <Card>
            <h2 className="mb-4 font-semibold text-charcoal dark:text-white">Recent bookings</h2>
            {(data?.recentBookings ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No bookings yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-400">
                    <tr>
                      <th className="py-2 pr-4">Booking</th>
                      <th className="py-2 pr-4">Service</th>
                      <th className="py-2 pr-4">Customer</th>
                      <th className="py-2 pr-4">Cleaner</th>
                      <th className="py-2 pr-4">Scheduled</th>
                      <th className="py-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recentBookings ?? []).map((b) => (
                      <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-2 pr-4 font-mono text-xs text-slate-500">{b.id.slice(0, 8)}…</td>
                        <td className="py-2 pr-4 text-slate-700 dark:text-slate-300 capitalize">{b.service_type?.replace(/_/g, " ")}</td>
                        <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{b.customer_email ?? "—"}</td>
                        <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{b.cleaner_name ?? "Unassigned"}</td>
                        <td className="py-2 pr-4 text-xs text-slate-500">{b.scheduled_for ? new Date(b.scheduled_for).toLocaleDateString() : "—"}</td>
                        <td className="py-2 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[b.status] ?? "bg-slate-100 text-slate-700"}`}>
                            {b.status?.replace(/_/g, " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Recent audit events */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-charcoal dark:text-white">Recent audit events</h2>
              <a href="/events" className="text-xs text-seafoam-600 hover:underline">View all →</a>
            </div>
            {(data?.recentAudit ?? []).length === 0 ? (
              <p className="py-4 text-sm text-slate-400">No audit events yet. Events are recorded when admin actions are taken.</p>
            ) : (
              <div className="space-y-2">
                {(data?.recentAudit ?? []).map((e) => (
                  <div key={`${e.created_at}::${e.action}`} className="flex items-center gap-3 text-sm">
                    <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(e.created_at).toLocaleTimeString()}</span>
                    <Badge variant={actionVariant(e.action)}>{e.action}</Badge>
                    <span className="text-slate-600 dark:text-slate-300 truncate">{e.target_type}:{e.target_id}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* PostHog embed — loaded only on demand so a stale share link can't
              auto-spam PostHog's fake_token/401 errors on every page view. */}
          {DASHBOARD_URL_VALID && (
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-charcoal dark:text-white">Analytics</h2>
                {!showAnalytics && (
                  <button
                    onClick={() => setShowAnalytics(true)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                  >
                    Load dashboard
                  </button>
                )}
              </div>
              {showAnalytics ? (
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                  <iframe
                    title="PostHog dashboard"
                    src={POSTHOG_DASHBOARD_URL}
                    className="h-[480px] w-full"
                    allowFullScreen
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Embedded PostHog dashboard. Click “Load dashboard” to display it. If it
                  fails to load, the share link has likely expired — regenerate it in
                  PostHog and update the <code>VITE_POSTHOG_DASHBOARD_URL</code> secret.
                </p>
              )}
            </Card>
          )}
        </>
      )}
    </DashboardShell>
  );
}
