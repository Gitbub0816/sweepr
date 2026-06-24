import { useState, useEffect, useCallback, Suspense } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  Activity, Server, CreditCard, TrendingUp, Truck, Shield,
  Heart, RefreshCw, AlertTriangle, CheckCircle2, Clock,
  ChevronDown, ChevronUp,
} from "lucide-react";
import {
  HealthOrb,
  BarChart3D,
  LatencyGauges,
  FunnelViz,
  PaymentFlowViz,
} from "../components/ObservabilityCharts";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

type Tab =
  | "overview"
  | "api-health"
  | "payments"
  | "booking-funnel"
  | "cleaner-ops"
  | "audit-trail"
  | "integrations";

const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "api-health", label: "API Health", icon: Server },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "booking-funnel", label: "Booking Funnel", icon: TrendingUp },
  { id: "cleaner-ops", label: "Cleaner Ops", icon: Truck },
  { id: "audit-trail", label: "Audit Trail", icon: Shield },
  { id: "integrations", label: "Integrations", icon: Heart },
];

function useObs<T>(path: string, params?: Record<string, string>) {
  const { getToken } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      const res = await fetch(`${API}/admin/observability/${path}${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as T);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path, JSON.stringify(params)]); // eslint-disable-line

  useEffect(() => { void load(); }, [load]);
  return { data, loading, error, reload: load };
}

function StatCard({ label, value, sub, color = "slate" }: { label: string; value: string | number; sub?: string; color?: "slate" | "red" | "green" | "amber" | "blue" }) {
  const colors = {
    slate: "bg-white border-slate-200 text-charcoal",
    red: "bg-red-50 border-red-200 text-red-700",
    green: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, onRefresh, loading }: { title: string; onRefresh: () => void; loading: boolean }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-semibold text-charcoal">{title}</h2>
      <button onClick={onRefresh} disabled={loading} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50">
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
      </button>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-2 text-sm text-red-600">
      <AlertTriangle className="h-4 w-4 shrink-0" /> {msg}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 bg-slate-100 rounded-xl" />
      ))}
    </div>
  );
}

// ─── Sub-tabs ────────────────────────────────────────────────────────────────

function OverviewTab() {
  interface OverviewData {
    apiHealth: { total: number; errors_5xx: number; errors_4xx: number; avg_latency_ms: number; p95_latency_ms: number };
    paymentHealth: { total: number; success: number; failed: number };
    recentErrors: Array<{ path: string; status_code: number; error_message: string; logged_at: string }>;
    eventCounts: Array<{ event_name: string; count: number }>;
  }
  const { data, loading, error, reload } = useObs<OverviewData>("overview");

  const errorRate = data?.apiHealth?.total
    ? (((data.apiHealth.errors_5xx + data.apiHealth.errors_4xx) / data.apiHealth.total) * 100).toFixed(1)
    : "—";
  const paySuccessRate = data?.paymentHealth?.total
    ? ((data.paymentHealth.success / data.paymentHealth.total) * 100).toFixed(1)
    : "—";

  return (
    <div className="space-y-6">
      <SectionHeader title="System Overview (last 24 h)" onRefresh={reload} loading={loading} />
      {error && <ErrorBox msg={error} />}

      {/* R3F visual hero — health orbs */}
      {!loading && data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="col-span-1 bg-white rounded-xl border border-slate-200 p-3">
            <Suspense fallback={<div className="h-32 bg-slate-100 rounded-lg animate-pulse" />}>
              <HealthOrb
                errorRate={parseFloat(errorRate) || 0}
                label={`${data.apiHealth?.total ?? 0} requests`}
              />
            </Suspense>
          </div>
          <div className="col-span-1 bg-white rounded-xl border border-slate-200 p-3">
            <Suspense fallback={<div className="h-32 bg-slate-100 rounded-lg animate-pulse" />}>
              <PaymentFlowViz
                successRate={data.paymentHealth?.total
                  ? (data.paymentHealth.success / data.paymentHealth.total) * 100
                  : 100}
                total={data.paymentHealth?.total ?? 0}
              />
            </Suspense>
          </div>
          <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-3">
            <Suspense fallback={<div className="h-32 bg-slate-100 rounded-lg animate-pulse" />}>
              <BarChart3D
                title="Top Events (24h)"
                data={(data.eventCounts ?? []).slice(0, 6).map(e => ({
                  label: e.event_name.replace(/_/g, " ").slice(0, 8),
                  value: e.count,
                  color: "#14b8a6",
                }))}
              />
            </Suspense>
          </div>
        </div>
      )}

      {loading ? <LoadingGrid /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="API Requests" value={data?.apiHealth?.total ?? "—"} />
            <StatCard label="Error Rate" value={`${errorRate}%`}
              color={parseFloat(errorRate) > 5 ? "red" : parseFloat(errorRate) > 1 ? "amber" : "green"} />
            <StatCard label="Avg Latency" value={data?.apiHealth?.avg_latency_ms ? `${data.apiHealth.avg_latency_ms}ms` : "—"} />
            <StatCard label="P95 Latency" value={data?.apiHealth?.p95_latency_ms ? `${data.apiHealth.p95_latency_ms}ms` : "—"}
              color={(data?.apiHealth?.p95_latency_ms ?? 0) > 2000 ? "amber" : "slate"} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Payment Events (24h)" value={data?.paymentHealth?.total ?? "—"} />
            <StatCard label="Payment Success Rate" value={`${paySuccessRate}%`}
              color={parseFloat(paySuccessRate) < 95 ? "red" : "green"} />
            <StatCard label="Payment Failures" value={data?.paymentHealth?.failed ?? "—"}
              color={(data?.paymentHealth?.failed ?? 0) > 0 ? "amber" : "green"} />
          </div>
        </>
      )}

      {!loading && (data?.recentErrors?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-600 mb-2">Recent 5xx Errors</h3>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Path</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Error</th>
                  <th className="px-3 py-2 text-left">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data!.recentErrors.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-charcoal">{row.path}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5">{row.status_code}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 max-w-xs truncate">{row.error_message ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-400">{new Date(row.logged_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiHealthTab() {
  const [range, setRange] = useState<"1h" | "24h" | "7d">("24h");
  interface ApiHealthData {
    summary: { total_requests: number; errors_5xx: number; errors_4xx: number; success_2xx: number; avg_latency_ms: number; p50_latency_ms: number; p95_latency_ms: number; p99_latency_ms: number };
    byPath: Array<{ path: string; count: number; errors: number; avg_ms: number }>;
    byStatus: Array<{ status_code: number; count: number }>;
    latencyBuckets: Array<{ bucket: string; count: number }>;
    recentErrors: Array<{ method: string; path: string; status_code: number; duration_ms: number; error_message: string; user_role: string; country_code: string; logged_at: string }>;
  }
  const { data, loading, error, reload } = useObs<ApiHealthData>("api-health", { range });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="API Health" onRefresh={reload} loading={loading} />
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 ml-auto -mt-4">
          {(["1h", "24h", "7d"] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${range === r ? "bg-white text-charcoal shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorBox msg={error} />}
      {loading ? <LoadingGrid /> : data && (
        <>
          {/* R3F Latency gauges */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <Suspense fallback={<div className="h-40 bg-slate-100 rounded-lg animate-pulse" />}>
              <LatencyGauges
                p50={data.summary?.p50_latency_ms ?? 0}
                p95={data.summary?.p95_latency_ms ?? 0}
                p99={data.summary?.p99_latency_ms ?? 0}
              />
            </Suspense>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Requests" value={data.summary?.total_requests ?? "—"} />
            <StatCard label="5xx Errors" value={data.summary?.errors_5xx ?? "—"} color={(data.summary?.errors_5xx ?? 0) > 0 ? "red" : "green"} />
            <StatCard label="P95 Latency" value={data.summary?.p95_latency_ms ? `${data.summary.p95_latency_ms}ms` : "—"} />
            <StatCard label="P99 Latency" value={data.summary?.p99_latency_ms ? `${data.summary.p99_latency_ms}ms` : "—"} color={(data.summary?.p99_latency_ms ?? 0) > 5000 ? "amber" : "slate"} />
          </div>

          {data.byPath.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-2">Top Paths</h3>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2 text-left">Path</th>
                      <th className="px-3 py-2 text-right">Requests</th>
                      <th className="px-3 py-2 text-right">Errors</th>
                      <th className="px-3 py-2 text-right">Avg ms</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.byPath.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-charcoal">{row.path}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{row.count}</td>
                        <td className="px-3 py-2 text-right">
                          {row.errors > 0
                            ? <span className="text-red-600 font-medium">{row.errors}</span>
                            : <span className="text-emerald-600">0</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500">{row.avg_ms ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.recentErrors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-2">Recent Errors ({data.recentErrors.length})</h3>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2 text-left">Method</th>
                      <th className="px-3 py-2 text-left">Path</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Ms</th>
                      <th className="px-3 py-2 text-left">Error</th>
                      <th className="px-3 py-2 text-left">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recentErrors.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-slate-500">{row.method}</td>
                        <td className="px-3 py-2 font-mono text-charcoal">{row.path}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 ${row.status_code >= 500 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {row.status_code}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{row.duration_ms ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-xs truncate">{row.error_message ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-400">{new Date(row.logged_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PaymentsTab() {
  const [range, setRange] = useState<"1h" | "24h" | "7d">("24h");
  interface PaymentsData {
    summary: { total: number; success: number; failed: number; total_volume_cents: number };
    byType: Array<{ event_type: string; total: number; success: number; failed: number }>;
    failures: Array<{ event_type: string; error_code: string; error_message: string; amount_cents: number; occurred_at: string }>;
    recentEvents: Array<{ event_type: string; success: boolean; amount_cents: number; currency: string; provider_event_id: string; error_code: string; occurred_at: string }>;
  }
  const { data, loading, error, reload } = useObs<PaymentsData>("payments", { range });

  const successRate = data?.summary?.total
    ? ((data.summary.success / data.summary.total) * 100).toFixed(1)
    : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Payment Observability" onRefresh={reload} loading={loading} />
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 ml-auto -mt-4">
          {(["1h", "24h", "7d"] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${range === r ? "bg-white text-charcoal shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorBox msg={error} />}
      {loading ? <LoadingGrid /> : data && (
        <>
          {/* R3F Payment flow */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <Suspense fallback={<div className="h-40 bg-slate-100 rounded-lg animate-pulse" />}>
                <PaymentFlowViz
                  successRate={data.summary?.total
                    ? (data.summary.success / data.summary.total) * 100
                    : 100}
                  total={data.summary?.total ?? 0}
                />
              </Suspense>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <Suspense fallback={<div className="h-40 bg-slate-100 rounded-lg animate-pulse" />}>
                <BarChart3D
                  title="By Event Type"
                  data={(data.byType ?? []).slice(0, 5).map(t => ({
                    label: t.event_type.replace(/_/g, " ").slice(0, 8),
                    value: t.total,
                    color: t.failed > 0 ? "#ef4444" : "#10b981",
                  }))}
                />
              </Suspense>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Events" value={data.summary?.total ?? "—"} />
            <StatCard label="Success Rate" value={`${successRate}%`}
              color={parseFloat(successRate) < 95 ? "red" : "green"} />
            <StatCard label="Failures" value={data.summary?.failed ?? "—"}
              color={(data.summary?.failed ?? 0) > 0 ? "amber" : "green"} />
            <StatCard label="Volume" value={data.summary?.total_volume_cents
              ? `$${(data.summary.total_volume_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
              : "$0.00"} color="blue" />
          </div>

          {data.failures.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Payment Failures
              </h3>
              <div className="rounded-xl border border-red-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-red-50 text-red-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Error Code</th>
                      <th className="px-3 py-2 text-left">Message</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-left">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {data.failures.map((row, i) => (
                      <tr key={i} className="hover:bg-red-50">
                        <td className="px-3 py-2 font-mono text-charcoal">{row.event_type}</td>
                        <td className="px-3 py-2 text-red-600 font-medium">{row.error_code ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-xs truncate">{row.error_message ?? "—"}</td>
                        <td className="px-3 py-2 text-right text-charcoal">
                          {row.amount_cents ? `$${(row.amount_cents / 100).toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-400">{new Date(row.occurred_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.byType.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-2">By Event Type</h3>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Success</th>
                      <th className="px-3 py-2 text-right">Failed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.byType.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-charcoal">{row.event_type}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{row.total}</td>
                        <td className="px-3 py-2 text-right text-emerald-600">{row.success}</td>
                        <td className="px-3 py-2 text-right">{row.failed > 0 ? <span className="text-red-600 font-medium">{row.failed}</span> : <span className="text-emerald-600">0</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BookingFunnelTab() {
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  interface FunnelData {
    funnelSteps: Array<{ event_name: string; count: number; sessions: number }>;
    bookingsByStatus: Array<{ status: string; count: number }>;
    conversionByDevice: Array<{ device_type: string; count: number }>;
    dropoffEvents: Array<{ event_name: string; count: number; device_type: string }>;
  }
  const { data, loading, error, reload } = useObs<FunnelData>("booking-funnel", { range });

  const FUNNEL_ORDER = [
    "booking_flow_started", "address_entered", "service_selected",
    "cleaner_selected", "payment_started", "booking_confirmed",
  ];
  const FUNNEL_LABELS: Record<string, string> = {
    booking_flow_started: "Flow started",
    address_entered: "Address entered",
    service_selected: "Service selected",
    cleaner_selected: "Cleaner selected",
    payment_started: "Payment started",
    booking_confirmed: "Booking confirmed",
  };

  const stepMap = Object.fromEntries((data?.funnelSteps ?? []).map(s => [s.event_name, s]));
  const topCount = stepMap["booking_flow_started"]?.count || 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Booking Funnel" onRefresh={reload} loading={loading} />
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 ml-auto -mt-4">
          {(["24h", "7d", "30d"] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${range === r ? "bg-white text-charcoal shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorBox msg={error} />}
      {loading ? <LoadingGrid /> : (
        <>
          {/* R3F 3D Funnel */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <Suspense fallback={<div className="h-48 bg-slate-100 rounded-lg animate-pulse" />}>
              <FunnelViz
                steps={FUNNEL_ORDER.map(step => ({
                  label: FUNNEL_LABELS[step]?.split(" ")[0] ?? step,
                  count: stepMap[step]?.count ?? 0,
                }))}
              />
            </Suspense>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Funnel Steps</p>
            {FUNNEL_ORDER.map((step, i) => {
              const s = stepMap[step];
              const pct = s ? Math.round((s.count / topCount) * 100) : 0;
              const prevStep = i > 0 ? stepMap[FUNNEL_ORDER[i - 1]] : null;
              const dropoff = prevStep && s ? prevStep.count - s.count : null;
              return (
                <div key={step}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600">{FUNNEL_LABELS[step]}</span>
                    <span className="text-charcoal font-medium">
                      {s?.count ?? 0}
                      {dropoff !== null && dropoff > 0 && (
                        <span className="ml-2 text-red-400">−{dropoff}</span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-seafoam-400 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {(data?.bookingsByStatus?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-2">Bookings by Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {data!.bookingsByStatus.map(s => (
                  <StatCard key={s.status} label={s.status} value={s.count} />
                ))}
              </div>
            </div>
          )}

          {(data?.conversionByDevice?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-2">Confirmed Bookings by Device</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {data!.conversionByDevice.map(s => (
                  <StatCard key={s.device_type} label={s.device_type ?? "unknown"} value={s.count} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CleanerOpsTab() {
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  interface CleanerOpsData {
    dosStats: { total_jobs: number; completed: number; in_progress: number; cancelled: number };
    cleanerActivity: Array<{ event_name: string; count: number }>;
    lateArrivals: { count: number };
    checkoutTimes: { avg_checkout_mins: number };
  }
  const { data, loading, error, reload } = useObs<CleanerOpsData>("cleaner-ops", { range });

  const completionRate = data?.dosStats?.total_jobs
    ? ((data.dosStats.completed / data.dosStats.total_jobs) * 100).toFixed(1)
    : "—";

  const EVENT_LABELS: Record<string, string> = {
    cleaner_start_route: "Route started",
    cleaner_arrived: "Arrived",
    cleaner_start_clean: "Clean started",
    cleaner_finish_clean: "Clean finished",
    cleaner_checkout: "Checkout",
    cleaner_photo_added: "Photos added",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Cleaner Operations" onRefresh={reload} loading={loading} />
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 ml-auto -mt-4">
          {(["24h", "7d", "30d"] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${range === r ? "bg-white text-charcoal shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorBox msg={error} />}
      {loading ? <LoadingGrid /> : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Jobs" value={data.dosStats?.total_jobs ?? "—"} />
            <StatCard label="Completion Rate" value={`${completionRate}%`}
              color={parseFloat(completionRate) < 80 ? "amber" : "green"} />
            <StatCard label="Late Arrivals" value={data.lateArrivals?.count ?? 0}
              color={(data.lateArrivals?.count ?? 0) > 0 ? "amber" : "green"} />
            <StatCard label="Avg Checkout" value={data.checkoutTimes?.avg_checkout_mins ? `${data.checkoutTimes.avg_checkout_mins}min` : "—"} />
          </div>

          {data.cleanerActivity.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-2">Day-of-Service Activity</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {data.cleanerActivity.map(s => (
                  <StatCard key={s.event_name} label={EVENT_LABELS[s.event_name] ?? s.event_name} value={s.count} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AuditTrailTab() {
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  interface AuditData {
    rows: Array<{
      id: string; action: string; table_name: string; record_id: string;
      diff: Record<string, unknown>; created_at: string; actor_email: string; actor_role: string;
    }>;
    limit: number;
    offset: number;
  }

  const params: Record<string, string> = { limit: String(LIMIT), offset: String(offset) };
  if (actorFilter) params.actor = actorFilter;
  if (actionFilter) params.action = actionFilter;

  const { data, loading, error, reload } = useObs<AuditData>("audit-trail", params);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <SectionHeader title="Audit Trail" onRefresh={reload} loading={loading} />
      <div className="flex gap-3">
        <input value={actorFilter} onChange={e => { setActorFilter(e.target.value); setOffset(0); }}
          placeholder="Filter by actor email…"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400" />
        <input value={actionFilter} onChange={e => { setActionFilter(e.target.value); setOffset(0); }}
          placeholder="Filter by action…"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400" />
      </div>
      {error && <ErrorBox msg={error} />}
      {loading ? (
        <div className="space-y-2 animate-pulse">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-lg" />)}</div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Actor</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Table</th>
                <th className="px-3 py-2 text-left">Record</th>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.rows ?? []).map((row) => (
                <>
                  <tr key={row.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
                    <td className="px-3 py-2.5 text-charcoal">{row.actor_email ?? "—"}</td>
                    <td className="px-3 py-2.5"><span className="rounded-full bg-seafoam-100 text-seafoam-700 px-2 py-0.5">{row.action}</span></td>
                    <td className="px-3 py-2.5 font-mono text-slate-500">{row.table_name}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-400">{row.record_id?.slice(0, 8)}…</td>
                    <td className="px-3 py-2.5 text-slate-400">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-slate-300">
                      {expandedRow === row.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </td>
                  </tr>
                  {expandedRow === row.id && (
                    <tr key={`${row.id}-detail`}>
                      <td colSpan={6} className="px-4 py-3 bg-slate-50">
                        <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono max-h-48 overflow-auto">
                          {JSON.stringify(row.diff, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {(data?.rows?.length ?? 0) === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No audit events found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Showing {offset + 1}–{offset + (data?.rows?.length ?? 0)}</span>
        <div className="flex gap-2">
          <button onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0}
            className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40 hover:bg-slate-50">
            Previous
          </button>
          <button onClick={() => setOffset(offset + LIMIT)} disabled={(data?.rows?.length ?? 0) < LIMIT}
            className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40 hover:bg-slate-50">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function IntegrationsTab() {
  interface IntegrationsData {
    latest: Array<{ integration: string; status: string; latency_ms: number; error_message: string; checked_at: string }>;
    history: Array<{ integration: string; status: string; latency_ms: number; checked_at: string }>;
  }
  const { data, loading, error, reload } = useObs<IntegrationsData>("integration-health");

  const statusColor = (s: string) => {
    if (s === "healthy") return "bg-emerald-100 text-emerald-700";
    if (s === "degraded") return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="Integration Health" onRefresh={reload} loading={loading} />
      {error && <ErrorBox msg={error} />}

      {!loading && (data?.latest?.length ?? 0) === 0 && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-6 text-center text-sm text-slate-400">
          No integration health data yet. Health checks will appear here once integrations start reporting.
        </div>
      )}

      {!loading && (data?.latest?.length ?? 0) > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {data!.latest.map(row => (
            <div key={row.integration} className="bg-white rounded-xl border border-slate-200 px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${row.status === "healthy" ? "bg-emerald-100" : "bg-red-100"}`}>
                  {row.status === "healthy"
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : <AlertTriangle className="h-4 w-4 text-red-500" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-charcoal capitalize">{row.integration}</p>
                  {row.error_message && <p className="text-xs text-red-500 truncate max-w-xs">{row.error_message}</p>}
                </div>
              </div>
              <div className="text-right">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(row.status)}`}>{row.status}</span>
                <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" />
                  {row.latency_ms ? `${row.latency_ms}ms` : "—"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-700">
        Phase 2: Cloudflare Analytics, Sentry error rates, PostHog funnel data, Stripe webhook health, and Clerk auth metrics will be shown here once external API integrations are wired up.
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ObservabilityPage() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-charcoal">Observability</h1>
        <p className="text-sm text-slate-500 mt-0.5">System health, API performance, payment telemetry, and audit logs.</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 flex-wrap border-b border-slate-200 -mb-px">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-seafoam-500 text-seafoam-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "overview" && <OverviewTab />}
        {tab === "api-health" && <ApiHealthTab />}
        {tab === "payments" && <PaymentsTab />}
        {tab === "booking-funnel" && <BookingFunnelTab />}
        {tab === "cleaner-ops" && <CleanerOpsTab />}
        {tab === "audit-trail" && <AuditTrailTab />}
        {tab === "integrations" && <IntegrationsTab />}
      </div>
    </div>
  );
}
