import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  Zap, Users, CreditCard, Wallet, Bell, AlertTriangle,
  RefreshCw, Play, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Dashboard {
  pendingAssignments: number;
  pendingCaptures: number;
  pendingPayouts: number;
  pendingPayoutsCents: number;
  remindersDue: number;
  possibleNoshows: number;
  recentRuns: AutomationRun[];
}

interface AutomationRun {
  id: string;
  job_type: string;
  triggered_by: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "failed";
  result: Record<string, unknown>;
  error_message: string | null;
}

interface QueueEntry {
  booking_id: string;
  cleaner_id: string;
  position: number;
  status: string;
  score: number;
  offered_at: string | null;
  expires_at: string | null;
  service_type: string;
  scheduled_at: string;
  booking_status: string;
  cleaner_name: string;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
    running: "bg-amber-100 text-amber-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-slate-100 text-slate-500"}`}>{status}</span>;
}

function StatCard({
  icon: Icon, label, value, sub, color = "slate", onRun, running,
}: {
  icon: typeof Zap; label: string; value: string | number; sub?: string;
  color?: "slate" | "amber" | "red" | "green" | "blue";
  onRun?: () => void; running?: boolean;
}) {
  const bg = { slate: "bg-white", amber: "bg-amber-50", red: "bg-red-50", green: "bg-emerald-50", blue: "bg-blue-50" }[color];
  const tc = { slate: "text-charcoal", amber: "text-amber-700", red: "text-red-700", green: "text-emerald-700", blue: "text-blue-700" }[color];
  return (
    <div className={`rounded-xl border border-slate-200 p-4 ${bg}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={`h-4 w-4 ${tc}`} />
        {onRun && (
          <button onClick={onRun} disabled={running}
            className="flex items-center gap-1 text-xs text-seafoam-600 hover:text-seafoam-700 disabled:opacity-40 font-medium">
            {running ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Run
          </button>
        )}
      </div>
      <p className={`text-2xl font-bold ${tc}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export function AutomationPage() {
  const { getToken } = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const [dashRes, qRes] = await Promise.all([
        fetch(`${API}/admin/automation/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/admin/automation/queue`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (dashRes.ok) setDashboard(await dashRes.json() as Dashboard);
      if (qRes.ok) setQueue(((await qRes.json()) as { queue: QueueEntry[] }).queue);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  async function runJob(endpoint: string, label: string) {
    setRunning(r => ({ ...r, [endpoint]: true }));
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/automation/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await res.json() as { ok?: boolean; result?: Record<string, unknown>; error?: string };
      setToast({ msg: res.ok ? `${label}: ${JSON.stringify(data.result)}` : (data.error ?? "Failed"), ok: res.ok });
      void load();
    } catch {
      setToast({ msg: `${label} failed`, ok: false });
    } finally {
      setRunning(r => ({ ...r, [endpoint]: false }));
      setTimeout(() => setToast(null), 5000);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-charcoal">Automation Engine</h1>
          <p className="text-sm text-slate-500 mt-0.5">Assignment, payment capture, payouts, and ops automations.</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {toast && (
        <div className={`rounded-xl px-4 py-3 text-sm flex items-start gap-2 ${toast.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-600"}`}>
          {toast.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span className="font-mono text-xs break-all">{toast.msg}</span>
        </div>
      )}

      {/* Queue stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Pending assignments" value={dashboard?.pendingAssignments ?? "—"}
          color={dashboard?.pendingAssignments ? "amber" : "green"}
          onRun={() => runJob("expire-offers", "Expire offers")} running={running["expire-offers"]} />
        <StatCard icon={CreditCard} label="Uncaptured payments" value={dashboard?.pendingCaptures ?? "—"}
          color={dashboard?.pendingCaptures ? "amber" : "green"}
          onRun={() => runJob("capture-completed", "Batch capture")} running={running["capture-completed"]} />
        <StatCard icon={Wallet} label="Pending payouts" value={dashboard?.pendingPayouts ?? "—"}
          sub={dashboard?.pendingPayoutsCents ? `$${(dashboard.pendingPayoutsCents / 100).toFixed(2)} total` : undefined}
          color={dashboard?.pendingPayouts ? "blue" : "green"}
          onRun={() => runJob("batch-payouts", "Batch payouts")} running={running["batch-payouts"]} />
        <StatCard icon={Bell} label="Reminders due" value={dashboard?.remindersDue ?? "—"}
          color={dashboard?.remindersDue ? "amber" : "green"}
          onRun={() => runJob("send-reminders", "Send reminders")} running={running["send-reminders"]} />
        <StatCard icon={AlertTriangle} label="Possible no-shows" value={dashboard?.possibleNoshows ?? "—"}
          color={dashboard?.possibleNoshows ? "red" : "green"}
          onRun={() => runJob("noshow-check", "No-show check")} running={running["noshow-check"]} />
        <StatCard icon={Zap} label="Cron interval" value="15 min" sub="Configured in wrangler.toml" />
      </div>

      {/* Assignment queue */}
      {queue.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-600 mb-2">Active Assignment Queue ({queue.length})</h2>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Booking</th>
                  <th className="px-3 py-2 text-left">Service</th>
                  <th className="px-3 py-2 text-left">Scheduled</th>
                  <th className="px-3 py-2 text-left">Cleaner</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queue.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-slate-400">{row.booking_id.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-charcoal capitalize">{row.service_type}</td>
                    <td className="px-3 py-2 text-slate-500">{new Date(row.scheduled_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-charcoal">{row.cleaner_name}</td>
                    <td className="px-3 py-2 text-right font-medium text-seafoam-600">{row.score?.toFixed(1)}</td>
                    <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                    <td className="px-3 py-2 text-slate-400">
                      {row.expires_at ? new Date(row.expires_at).toLocaleTimeString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent runs */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-2">Recent Automation Runs</h2>
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          {(dashboard?.recentRuns?.length ?? 0) === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">No runs yet.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Job</th>
                  <th className="px-3 py-2 text-left">Triggered by</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Started</th>
                  <th className="px-3 py-2 text-right">Duration</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(dashboard?.recentRuns ?? []).map(run => {
                  const duration = run.finished_at
                    ? `${((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000).toFixed(1)}s`
                    : "—";
                  return (
                    <>
                      <tr key={run.id} className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}>
                        <td className="px-3 py-2.5 font-mono text-charcoal">{run.job_type}</td>
                        <td className="px-3 py-2.5 text-slate-500 max-w-32 truncate">{run.triggered_by === "cron" ? "⏱ cron" : run.triggered_by.slice(0, 12)}</td>
                        <td className="px-3 py-2.5">
                          {run.status === "completed" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                          {run.status === "failed" && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                          {run.status === "running" && <RefreshCw className="h-3.5 w-3.5 text-amber-500 animate-spin" />}
                        </td>
                        <td className="px-3 py-2.5 text-slate-400">{new Date(run.started_at).toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right text-slate-400">{duration}</td>
                        <td className="px-3 py-2.5 text-slate-300">
                          {expandedRun === run.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </td>
                      </tr>
                      {expandedRun === run.id && (
                        <tr key={`${run.id}-detail`}>
                          <td colSpan={6} className="px-4 py-3 bg-slate-50">
                            {run.error_message && (
                              <p className="text-xs text-red-600 mb-2 font-mono">{run.error_message}</p>
                            )}
                            <pre className="text-xs text-slate-600 font-mono whitespace-pre-wrap">
                              {JSON.stringify(run.result, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Cron info */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500">
        <p className="font-medium text-slate-600 mb-1">Cloudflare Cron Triggers</p>
        <p>The automation engine runs every 15 minutes via Cloudflare Cron Triggers. It processes expired assignment offers and captures completed payments automatically. The buttons above let you trigger any job on-demand.</p>
        <p className="mt-1">To run payouts: click <strong>Run</strong> on Pending Payouts, or automate weekly via a cron at <code>0 9 * * 1</code> (Monday 9am).</p>
      </div>
    </div>
  );
}
