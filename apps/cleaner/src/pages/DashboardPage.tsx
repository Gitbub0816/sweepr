/**
 * Cleaner Dashboard — feature-rich home page
 * Tabs: Overview · Jobs · Schedule · Earnings · Performance · Settings
 */
import { useState, useEffect, useCallback } from "react";
import {
  DashboardShell,
  StatCard,
  Badge,
  Button,
  Card,
  toast,
} from "@sweepr/ui";
import {
  Briefcase,
  CalendarDays,
  Wallet,
  BarChart3,
  Settings,
  CheckCircle2,
  Clock,
  Star,
  TrendingUp,
  MapPin,
  AlertCircle,
  DollarSign,
  Shield,
  Bell,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Loader2,
} from "lucide-react";
import { formatCurrency } from "@sweepr/utils";
import { useAuth, useUser } from "@clerk/clerk-react";

const API = import.meta.env.VITE_API_URL ?? "";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── API hook ─────────────────────────────────────────────────────────────────

function useApi<T>(path: string, enabled = true) {
  const { getToken } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

interface DashboardStats {
  upcomingJobs: number;
  completedThisMonth: number;
  earningsThisMonth: number;
  earningsAllTime: number;
  rating: number;
  reviewCount: number;
  tier: string;
  stripeConnected: boolean;
  nextJobAt: string | null;
  nextJobAddress: string | null;
  pendingPayout: number;
}

// ─── Onboarding Checklist ───────────────────────────────────────────────────
// Cleaners land on the dashboard immediately after signing up. Until their
// application is approved, this checklist lets them complete each onboarding
// section individually (deep-linked into the wizard) rather than being forced
// through a guided flow.

interface OnboardingStep {
  label: string;
  desc: string;
  step: number; // wizard step index (?step=N)
  done: boolean;
}

interface OnboardingProgress {
  status: string;
  steps: {
    profile: boolean;
    training: boolean;
    background: boolean;
    identity: boolean;
    submitted: boolean;
    approved: boolean;
  };
}

function OnboardingChecklist({ status }: { status: string | undefined }) {
  const { data: progress } = useApi<OnboardingProgress>("/cleaners/onboarding-progress");
  const { data: training } = useApi<{ summary: { totalPassed: number; totalRequired: number } }>(
    "/training/progress",
  );

  if (status === "approved") return null;

  const p = progress?.steps;
  const passed = training?.summary?.totalPassed ?? 0;
  const total = training?.summary?.totalRequired ?? 10;

  // Individual-cleaner steps (mirrors INDIVIDUAL_STEPS in OnboardingPage).
  const steps: OnboardingStep[] = [
    { label: "Profile & services", desc: "Name, photo, area & services", step: 0, done: p?.profile ?? false },
    { label: "Training", desc: `${passed}/${total} required modules`, step: -1, done: p?.training ?? false },
    { label: "Background check", desc: "Verify your record", step: 3, done: p?.background ?? false },
    { label: "Identity verification", desc: "Confirm who you are", step: 4, done: p?.identity ?? false },
    { label: "Review & submit", desc: "Send your application", step: 5, done: p?.submitted ?? false },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-amber-100 p-2.5">
          <Shield size={18} className="text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-amber-900">
            {status === "pending_review"
              ? "Application under review"
              : "Finish setting up your account"}
          </p>
          <p className="text-sm text-amber-700 mt-0.5">
            {status === "pending_review"
              ? "We're reviewing your application — we'll email you when you're approved. You can still update your profile and finish training below."
              : "Complete these steps to unlock the job board and start accepting bookings. You can do them in any order."}
          </p>
        </div>
      </div>

      {status !== "pending_review" && (
        <>
          <div className="mt-4 h-2 rounded-full bg-amber-100 overflow-hidden">
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-4 space-y-2">
            {steps.map((s) => (
              <a
                key={s.label}
                href={s.step === -1 ? "/training" : `/onboarding?step=${s.step}`}
                className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2.5 hover:bg-white transition-colors"
              >
                {s.done ? (
                  <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
                ) : (
                  <Clock size={18} className="text-amber-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{s.label}</p>
                  <p className="text-xs text-slate-500">{s.desc}</p>
                </div>
                <ChevronRight size={16} className="text-slate-300" />
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OverviewTab() {
  const { data, loading } = useApi<DashboardStats>("/cleaners/dashboard");
  const { user } = useUser();
  const status = user?.publicMetadata?.cleanerStatus as string | undefined;

  if (loading) return <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />;

  // Brand-new cleaners have no stats row yet — still show the checklist so they
  // can get started.
  if (!data) {
    return (
      <div className="space-y-6">
        <OnboardingChecklist status={status} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OnboardingChecklist status={status} />

      {/* Welcome */}
      <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white">
        <h2 className="text-xl font-semibold">Welcome back, {user?.firstName ?? "Pro"}</h2>
        <p className="text-indigo-100 text-sm mt-1">
          {data.upcomingJobs > 0
            ? `You have ${data.upcomingJobs} upcoming job${data.upcomingJobs > 1 ? "s" : ""}.`
            : "No upcoming jobs — check the Job Board to pick up a new booking."}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Badge variant="info">{data.tier ? data.tier.charAt(0).toUpperCase() + data.tier.slice(1) : "Standard"} Pro</Badge>
          {data.rating > 0 && (
            <span className="flex items-center gap-1 text-sm text-indigo-100">
              <Star size={14} className="fill-yellow-300 text-yellow-300" />
              {Number(data.rating).toFixed(1)} ({data.reviewCount} reviews)
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Upcoming Jobs"       value={String(data.upcomingJobs)}              icon={Briefcase} />
        <StatCard label="Completed This Month" value={String(data.completedThisMonth)}        icon={CheckCircle2} />
        <StatCard label="Earned This Month"   value={formatCurrency(data.earningsThisMonth / 100)} icon={DollarSign} />
        <StatCard label="Pending Payout"      value={formatCurrency(data.pendingPayout / 100)} icon={Wallet} />
      </div>

      {/* Next Job Card */}
      {data.nextJobAt && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5 flex items-start gap-4">
          <div className="rounded-full bg-indigo-100 p-2.5">
            <MapPin size={18} className="text-indigo-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-indigo-800">Next Job</p>
            <p className="text-sm text-indigo-700">
              {new Date(data.nextJobAt).toLocaleString()}
            </p>
            {data.nextJobAddress && (
              <p className="text-xs text-indigo-500 mt-0.5">{data.nextJobAddress}</p>
            )}
          </div>
          <a href="/jobs" className="text-indigo-600 text-xs font-medium flex items-center gap-1">
            View <ChevronRight size={12} />
          </a>
        </div>
      )}

      {/* Stripe Connect prompt */}
      {!data.stripeConnected && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4">
          <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800">Set up payouts</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Connect your bank account to receive payments for completed jobs.
            </p>
          </div>
          <a href="/earnings" className="text-sm font-medium text-amber-700 underline">
            Set up
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Upcoming Jobs Tab ────────────────────────────────────────────────────────

interface JobRow {
  id: string;
  status: string;
  day_status: string | null;
  service_type: string;
  scheduled_at: string;
  total_price: number;
  cleaner_payout: number | null;
  address_city: string;
  address_state: string;
  bedrooms: number;
  bathrooms: number;
}

const STATUS_COLOR: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800",
  offered_to_cleaner: "bg-yellow-100 text-yellow-800",
  cleaner_accepted: "bg-blue-100 text-blue-800",
  completed: "bg-slate-100 text-slate-600",
  cancelled_by_cleaner: "bg-red-100 text-red-700",
};

function JobsTab() {
  const { getToken } = useAuth();
  const { data, loading, reload } = useApi<{ jobs: JobRow[] }>("/cleaners/my-jobs");
  const [accepting, setAccepting] = useState<string | null>(null);

  async function accept(jobId: string) {
    setAccepting(jobId);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/jobs/${jobId}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      toast.success("Job accepted!");
      reload();
    } catch { toast.error("Could not accept job."); }
    finally { setAccepting(null); }
  }

  if (loading) return <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />;

  const jobs = data?.jobs ?? [];
  if (jobs.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 text-sm">
        No jobs yet. <a href="/jobs" className="text-indigo-600 underline">Browse the job board</a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <div key={job.id} className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-4">
          <div className="rounded-full bg-slate-100 p-2.5">
            <Briefcase size={16} className="text-slate-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium capitalize">{job.service_type.replace(/_/g, " ")} Clean</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[job.status] ?? "bg-slate-100 text-slate-600"}`}>
                {job.status.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {new Date(job.scheduled_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
            <p className="text-xs text-slate-400">
              {job.bedrooms}bd / {job.bathrooms}ba · {job.address_city}, {job.address_state}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-semibold text-slate-800">{formatCurrency((job.cleaner_payout ?? job.total_price * 0.8) / 100)}</p>
            {job.status === "offered_to_cleaner" && (
              <Button size="sm" className="mt-2" onClick={() => accept(job.id)} loading={accepting === job.id}>
                Accept
              </Button>
            )}
            {job.status === "confirmed" && (
              <a href={`/jobs/${job.id}`} className="text-xs text-indigo-600 font-medium mt-2 block">
                View Job
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Schedule / Availability Tab ──────────────────────────────────────────────

interface AvailabilitySlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
}

interface BlockedDate {
  id: string;
  blocked_date: string;
  reason: string | null;
}

function ScheduleTab() {
  const { getToken } = useAuth();
  const { data: avail, loading: loadingAvail, reload: reloadAvail } =
    useApi<{ slots: AvailabilitySlot[] }>("/cleaners/availability");
  const { data: blocked, loading: loadingBlocked, reload: reloadBlocked } =
    useApi<{ dates: BlockedDate[] }>("/cleaners/blocked-dates");

  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [newBlock, setNewBlock] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [addingBlock, setAddingBlock] = useState(false);

  useEffect(() => {
    if (avail?.slots) {
      // Fill all 7 days
      const filled = DAYS.map((_, i) => {
        const existing = avail.slots.find((s) => s.day_of_week === i);
        return existing ?? { day_of_week: i, start_time: "08:00", end_time: "18:00", active: false };
      });
      setSlots(filled);
    }
  }, [avail]);

  async function saveAvailability() {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/cleaners/availability`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ slots }),
      });
      if (!res.ok) throw new Error();
      toast.success("Availability saved.");
      reloadAvail();
    } catch { toast.error("Save failed."); }
    finally { setSaving(false); }
  }

  async function addBlockedDate() {
    if (!newBlock) return;
    setAddingBlock(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/cleaners/blocked-dates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ date: newBlock, reason: blockReason || null }),
      });
      if (!res.ok) throw new Error();
      toast.success("Date blocked.");
      setNewBlock("");
      setBlockReason("");
      reloadBlocked();
    } catch { toast.error("Failed."); }
    finally { setAddingBlock(false); }
  }

  async function removeBlockedDate(id: string) {
    const token = await getToken();
    await fetch(`${API}/cleaners/blocked-dates/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    reloadBlocked();
  }

  if (loadingAvail) return <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />;

  return (
    <div className="space-y-8">
      {/* Weekly Availability */}
      <div className="rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <CalendarDays size={16} /> Weekly Availability
        </h3>
        <div className="space-y-3">
          {slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-3">
              <button
                onClick={() => setSlots((s) => s.map((x, j) => j === i ? { ...x, active: !x.active } : x))}
                className="flex-shrink-0"
              >
                {slot.active
                  ? <ToggleRight size={24} className="text-indigo-600" />
                  : <ToggleLeft size={24} className="text-slate-400" />}
              </button>
              <span className="w-10 text-sm font-medium text-slate-700">{DAYS[i]}</span>
              <input
                type="time"
                disabled={!slot.active}
                value={slot.start_time}
                onChange={(e) => setSlots((s) => s.map((x, j) => j === i ? { ...x, start_time: e.target.value } : x))}
                className="rounded border border-slate-200 px-2 py-1 text-sm disabled:opacity-40"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="time"
                disabled={!slot.active}
                value={slot.end_time}
                onChange={(e) => setSlots((s) => s.map((x, j) => j === i ? { ...x, end_time: e.target.value } : x))}
                className="rounded border border-slate-200 px-2 py-1 text-sm disabled:opacity-40"
              />
            </div>
          ))}
        </div>
        <Button onClick={saveAvailability} loading={saving}>Save Availability</Button>
      </div>

      {/* Blocked Dates */}
      <div className="rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">Blocked Dates</h3>
        <div className="flex gap-2">
          <input
            type="date"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={newBlock}
            onChange={(e) => setNewBlock(e.target.value)}
          />
          <input
            type="text"
            placeholder="Reason (optional)"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
          />
          <Button size="sm" onClick={addBlockedDate} loading={addingBlock}>Block</Button>
        </div>
        {!loadingBlocked && blocked?.dates && blocked.dates.length > 0 && (
          <div className="space-y-2">
            {blocked.dates.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium">{d.blocked_date}</span>
                <span className="text-slate-400">{d.reason ?? "—"}</span>
                <button onClick={() => removeBlockedDate(d.id)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Earnings Tab ─────────────────────────────────────────────────────────────

interface EarningSummary {
  thisWeek: number;
  thisMonth: number;
  lastMonth: number;
  allTime: number;
  pendingPayout: number;
  nextPayoutDate: string | null;
  stripeConnected: boolean;
  onboardingUrl: string | null;
  recent: { date: string; amount: number; status: string; booking_id: string }[];
}

function EarningsTab() {
  const { getToken } = useAuth();
  const { data, loading } = useApi<EarningSummary>("/cleaners/earnings");
  const [connecting, setConnecting] = useState(false);

  async function setupPayouts() {
    setConnecting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/cleaners/stripe-connect/onboard`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { url?: string };
      if (json.url) window.location.href = json.url;
    } catch { toast.error("Could not start Stripe onboarding."); }
    finally { setConnecting(false); }
  }

  if (loading) return <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {!data.stripeConnected && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4">
          <Shield size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800">Connect your bank account</p>
            <p className="text-sm text-amber-700 mt-1">You need a Stripe Express account to receive payouts.</p>
          </div>
          <Button size="sm" onClick={setupPayouts} loading={connecting}>Set up payouts</Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="This Week"    value={formatCurrency(data.thisWeek / 100)}    icon={Wallet} />
        <StatCard label="This Month"   value={formatCurrency(data.thisMonth / 100)}   icon={TrendingUp} />
        <StatCard label="Last Month"   value={formatCurrency(data.lastMonth / 100)}   icon={BarChart3} />
        <StatCard label="All Time"     value={formatCurrency(data.allTime / 100)}     icon={DollarSign} />
      </div>

      {data.pendingPayout > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <strong>{formatCurrency(data.pendingPayout / 100)}</strong> pending payout
          {data.nextPayoutDate && ` — expected ${new Date(data.nextPayoutDate).toLocaleDateString()}`}.
        </div>
      )}

      {data.recent.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-sm font-medium text-slate-700">Recent Payouts</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-50 text-xs text-slate-500">
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-right px-4 py-2">Amount</th>
                <th className="text-left px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.booking_id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2 text-slate-600">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.amount / 100)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === "paid" || r.status === "transferred" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Performance Tab ──────────────────────────────────────────────────────────

interface PerformanceStats {
  completionRate: number;
  avgRating: number;
  reviewCount: number;
  onTimeRate: number;
  disputeRate: number;
  tier: string;
  tierProgress: number; // 0-100% towards next tier
  nextTier: string | null;
  thisMonthJobs: number;
  acceptanceRate: number;
  recentReviews: { rating: number; comment: string | null; created_at: string }[];
}

function PerformanceTab() {
  const { data, loading } = useApi<PerformanceStats>("/cleaners/performance-stats");

  if (loading) return <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Tier card */}
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">Current Tier</p>
            <p className="text-2xl font-bold text-indigo-800 capitalize">{data.tier}</p>
          </div>
          <div className="rounded-full bg-indigo-100 p-3">
            <Star size={20} className="text-indigo-600 fill-indigo-200" />
          </div>
        </div>
        {data.nextTier && (
          <>
            <div className="h-2 rounded-full bg-indigo-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{ width: `${Math.min(data.tierProgress, 100)}%` }}
              />
            </div>
            <p className="text-xs text-indigo-500 mt-1.5">
              {data.tierProgress.toFixed(0)}% towards <span className="font-medium capitalize">{data.nextTier}</span>
            </p>
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Completion Rate" value={`${data.completionRate.toFixed(1)}%`} icon={CheckCircle2} />
        <StatCard label="On-Time Rate"    value={`${data.onTimeRate.toFixed(1)}%`}    icon={Clock} />
        <StatCard label="Acceptance Rate" value={`${data.acceptanceRate.toFixed(1)}%`} icon={Briefcase} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Avg Rating</span>
            <div className="flex items-center gap-1">
              {[1,2,3,4,5].map((s) => (
                <Star key={s} size={16} className={s <= Math.round(data.avgRating) ? "fill-yellow-400 text-yellow-400" : "text-slate-200"} />
              ))}
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-800 mt-2">{Number(data.avgRating).toFixed(1)}</p>
          <p className="text-xs text-slate-400">{data.reviewCount} reviews</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-5">
          <span className="text-sm text-slate-500">Dispute Rate</span>
          <p className="text-3xl font-bold text-slate-800 mt-2">{data.disputeRate.toFixed(2)}%</p>
          <p className="text-xs text-slate-400">Lower is better</p>
        </div>
      </div>

      {data.recentReviews.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-800">Recent Reviews</h3>
          {data.recentReviews.map((r, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-1 mb-2">
                {[1,2,3,4,5].map((s) => (
                  <Star key={s} size={14} className={s <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-slate-200"} />
                ))}
                <span className="text-xs text-slate-400 ml-2">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              {r.comment && <p className="text-sm text-slate-600">"{r.comment}"</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

interface CleanerSettings {
  max_jobs_per_day: number;
  max_distance_miles: number;
  accepts_last_minute: boolean;
  notification_job_offer: boolean;
  notification_reminder: boolean;
  notification_payout: boolean;
  notification_marketing: boolean;
  preferred_service_types: string[];
}

function SettingsTab() {
  const { getToken } = useAuth();
  const { data, loading } = useApi<CleanerSettings>("/cleaners/settings");
  const [form, setForm] = useState<CleanerSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm({ ...data }); }, [data]);

  if (loading || !form) return <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />;

  function toggle(k: keyof CleanerSettings) {
    setForm((f) => f ? { ...f, [k]: !f[k as keyof typeof f] } : f);
  }

  async function save() {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/cleaners/settings`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success("Settings saved.");
    } catch { toast.error("Save failed."); }
    finally { setSaving(false); }
  }

  const SERVICE_TYPES = ["standard", "deep", "move_in_out", "recurring"] as const;

  function toggleServiceType(st: string) {
    setForm((f) => {
      if (!f) return f;
      const has = f.preferred_service_types.includes(st);
      return {
        ...f,
        preferred_service_types: has
          ? f.preferred_service_types.filter((x) => x !== st)
          : [...f.preferred_service_types, st],
      };
    });
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">Job Preferences</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Max jobs / day</label>
            <input
              type="number" min={1} max={10}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.max_jobs_per_day}
              onChange={(e) => setForm((f) => f ? { ...f, max_jobs_per_day: Number(e.target.value) } : f)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Max distance (miles)</label>
            <input
              type="number" min={1} max={100}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.max_distance_miles}
              onChange={(e) => setForm((f) => f ? { ...f, max_distance_miles: Number(e.target.value) } : f)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-500">Preferred Service Types</label>
          <div className="flex flex-wrap gap-2">
            {SERVICE_TYPES.map((st) => (
              <button
                key={st}
                onClick={() => toggleServiceType(st)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  form.preferred_service_types.includes(st)
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {st.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-700">Accept last-minute bookings</span>
          <button onClick={() => toggle("accepts_last_minute")}>
            {form.accepts_last_minute
              ? <ToggleRight size={24} className="text-indigo-600" />
              : <ToggleLeft size={24} className="text-slate-400" />}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Bell size={16} /> Notifications</h3>
        {(
          [
            ["notification_job_offer",  "New job offers"],
            ["notification_reminder",   "Job reminders"],
            ["notification_payout",     "Payout updates"],
            ["notification_marketing",  "Tips & promotions"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm text-slate-700">{label}</span>
            <button onClick={() => toggle(key)}>
              {form[key]
                ? <ToggleRight size={24} className="text-indigo-600" />
                : <ToggleLeft size={24} className="text-slate-400" />}
            </button>
          </div>
        ))}
      </div>

      <Button onClick={save} loading={saving}>Save Settings</Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type DashTab = "overview" | "jobs" | "schedule" | "earnings" | "performance" | "settings";

const TABS: { id: DashTab; label: string; icon: React.ElementType }[] = [
  { id: "overview",     label: "Overview",     icon: LayoutDashboard },
  { id: "jobs",         label: "My Jobs",      icon: Briefcase },
  { id: "schedule",     label: "Schedule",     icon: CalendarDays },
  { id: "earnings",     label: "Earnings",     icon: Wallet },
  { id: "performance",  label: "Performance",  icon: BarChart3 },
  { id: "settings",     label: "Settings",     icon: Settings },
];

import { LayoutDashboard } from "lucide-react";

export function DashboardPage() {
  const [tab, setTab] = useState<DashTab>("overview");

  return (
    <DashboardShell title="My Dashboard" description="Your jobs, earnings, schedule & performance at a glance.">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 -mb-px pb-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="pt-2">
        {tab === "overview"    && <OverviewTab />}
        {tab === "jobs"        && <JobsTab />}
        {tab === "schedule"    && <ScheduleTab />}
        {tab === "earnings"    && <EarningsTab />}
        {tab === "performance" && <PerformanceTab />}
        {tab === "settings"    && <SettingsTab />}
      </div>
    </DashboardShell>
  );
}
