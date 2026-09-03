/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Cleaner Dashboard — feature-rich home page
 * Tabs: Overview · Jobs · Schedule · Earnings · Performance · Settings
 */
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { LanguageSelector } from "../i18n/LanguageSelector";
import {
  DashboardShell,
  StatCard,
  Badge,
  StatusBadge,
  Button,
  Card,
  toast,
  useReducedMotion,
} from "@sweepr/ui";
import type { JobStatus } from "@sweepr/types";
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
import { useAppToken } from "@/lib/appToken";
import { FounderBanner } from "../components/FounderBanner";
import { CleaningTypeGuide, AcceptedJobTypesPicker } from "../components/CleaningTypeGuide";

const API = import.meta.env.VITE_API_URL ?? "";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── API hook ─────────────────────────────────────────────────────────────────

function useApi<T>(path: string, enabled = true) {
  const { getToken } = useAppToken();
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
    insurance: boolean;
    submitted: boolean;
    approved: boolean;
  };
}

function OnboardingChecklist({ status }: { status: string | undefined }) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const { data: progress, loading: progressLoading } =
    useApi<OnboardingProgress>("/cleaners/onboarding-progress");
  const { data: training } = useApi<{ summary: { totalPassed: number; totalRequired: number } }>(
    "/training/progress",
  );

  const p = progress?.steps;

  // Hide the banner once the cleaner is approved OR every onboarding step is
  // done. The `status` prop can be stale/undefined on the dashboard payload,
  // so also trust the fresh /onboarding-progress status + step flags — otherwise
  // a fully-onboarded cleaner keeps seeing "Finish setting up your account".
  const allStepsDone = Boolean(
    p && p.profile && p.training && p.background && p.identity && p.insurance && p.submitted,
  );
  if (status === "approved" || progress?.status === "approved" || allStepsDone) return null;
  // Never flash the "incomplete" banner while the authoritative status is still
  // loading — an approved cleaner would see it appear and then vanish on every
  // dashboard visit (and it shoves the layout around when it unmounts).
  if (status !== "pending_review" && (progressLoading || !progress)) return null;
  const passed = training?.summary?.totalPassed ?? 0;
  const total = training?.summary?.totalRequired ?? 10;

  // Individual-cleaner steps (mirrors INDIVIDUAL_STEPS in OnboardingPage).
  const steps: OnboardingStep[] = [
    { label: t("cleaner.dashboard.onboarding.profile"), desc: "Name, photo, area & services", step: 0, done: p?.profile ?? false },
    { label: t("cleaner.dashboard.onboarding.training"), desc: `${passed}/${total} required modules`, step: -1, done: p?.training ?? false },
    { label: t("cleaner.dashboard.onboarding.backgroundCheck"), desc: "Verify your record", step: 3, done: p?.background ?? false },
    { label: t("cleaner.dashboard.onboarding.identity"), desc: "Confirm who you are", step: 4, done: p?.identity ?? false },
    { label: t("cleaner.dashboard.onboarding.insurance"), desc: "Upload your liability policy for review", step: -2, done: p?.insurance ?? false },
    { label: t("cleaner.dashboard.onboarding.review"), desc: "Send your application", step: 5, done: p?.submitted ?? false },
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
              ? t("cleaner.dashboard.underReview")
              : t("cleaner.dashboard.finishSetup")}
          </p>
          <p className="text-sm text-amber-700 mt-0.5">
            {status === "pending_review"
              ? t("cleaner.dashboard.reviewingApplication")
              : t("cleaner.dashboard.completeSteps")}
          </p>
        </div>
      </div>

      {status !== "pending_review" && (
        <>
          <div className="mt-4 h-2 rounded-full bg-amber-100 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-amber-500"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.7, ease: "easeOut" }}
            />
          </div>
          <div className="mt-4 space-y-2">
            {steps.map((s) => (
              <a
                key={s.label}
                href={s.step === -1 ? "/training" : s.step === -2 ? "/insurance" : `/onboarding?step=${s.step}`}
                className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2.5 hover:bg-white transition-colors"
              >
                <span className="relative flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center">
                  <AnimatePresence mode="wait" initial={false}>
                    {s.done ? (
                      <motion.span
                        key="done"
                        className="absolute inset-0 flex items-center justify-center"
                        initial={reducedMotion ? false : { scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={reducedMotion ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
                        transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
                      >
                        <CheckCircle2 size={18} className="text-green-600" />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="pending"
                        className="absolute inset-0 flex items-center justify-center"
                        initial={reducedMotion ? false : { scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={reducedMotion ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
                        transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
                      >
                        <Clock size={18} className="text-amber-400" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
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
  const { t } = useTranslation();
  const { data, loading } = useApi<DashboardStats>("/cleaner-dashboard/dashboard");
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
      <FounderBanner />
      <OnboardingChecklist status={status} />

      {/* Welcome */}
      <div className="rounded-xl bg-gradient-to-r from-seafoam-600 to-teal-700 p-6 text-white">
        <h2 className="text-xl font-semibold">{t("cleaner.dashboard.welcomeBack", { name: user?.firstName ?? t("cleaner.dashboard.pro") })}</h2>
        <p className="text-seafoam-100 text-sm mt-1">
          {data.upcomingJobs > 0
            ? data.upcomingJobs === 1 ? t("cleaner.dashboard.upcomingJob", { count: data.upcomingJobs }) : t("cleaner.dashboard.upcomingJobs", { count: data.upcomingJobs })
            : t("cleaner.dashboard.noUpcomingJobs")}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Badge variant="info">{data.tier ? data.tier.charAt(0).toUpperCase() + data.tier.slice(1) : "Standard"} {t("cleaner.dashboard.pro")}</Badge>
          {data.rating > 0 && (
            <span className="flex items-center gap-1 text-sm text-seafoam-100">
              <Star size={14} className="fill-yellow-300 text-yellow-300" />
              {Number(data.rating).toFixed(1)} ({data.reviewCount} reviews)
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("cleaner.dashboard.stats.upcomingJobs")}       value={String(data.upcomingJobs)}              icon={Briefcase} />
        <StatCard label={t("cleaner.dashboard.stats.completedThisMonth")} value={String(data.completedThisMonth)}        icon={CheckCircle2} />
        <StatCard label={t("cleaner.dashboard.stats.earnedThisMonth")}   value={formatCurrency(data.earningsThisMonth / 100)} icon={DollarSign} />
        <StatCard label={t("cleaner.dashboard.stats.pendingPayout")}      value={formatCurrency(data.pendingPayout / 100)} icon={Wallet} />
      </div>

      {/* Next Job Card */}
      {data.nextJobAt && (
        <div className="rounded-xl border border-seafoam-100 bg-seafoam-50 p-5 flex items-start gap-4">
          <div className="rounded-full bg-seafoam-100 p-2.5">
            <MapPin size={18} className="text-seafoam-700" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-seafoam-800">{t("cleaner.dashboard.nextJob")}</p>
            <p className="text-sm text-seafoam-700">
              {new Date(data.nextJobAt).toLocaleString()}
            </p>
            {data.nextJobAddress && (
              <p className="text-xs text-seafoam-600 mt-0.5">{data.nextJobAddress}</p>
            )}
          </div>
          <a href="/jobs" className="text-seafoam-700 text-xs font-medium flex items-center gap-1">
            View <ChevronRight size={12} />
          </a>
        </div>
      )}

      {/* Stripe Connect prompt */}
      {!data.stripeConnected && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4">
          <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800">{t("cleaner.dashboard.setupPayouts")}</p>
            <p className="text-sm text-amber-700 mt-0.5">
              {t("cleaner.dashboard.setupPayoutsDesc")}
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
  status: JobStatus;
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

function JobsTab() {
  const { getToken } = useAppToken();
  const { data, loading, reload } = useApi<{ jobs: JobRow[] }>("/cleaner-dashboard/my-jobs");
  const [accepting, setAccepting] = useState<string | null>(null);

  async function accept(jobId: string) {
    setAccepting(jobId);
    try {
      const token = await getToken();
      // Canonical accept endpoint (assignment_queue). The old `/jobs/:id/accept`
      // path doesn't exist — it 404'd every time.
      const res = await fetch(`${API}/cleaner-dashboard/jobs/${jobId}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      toast.success("Job accepted. It's on your schedule.");
      reload();
    } catch { toast.error("Could not accept job."); }
    finally { setAccepting(null); }
  }

  if (loading) return <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />;

  const jobs = data?.jobs ?? [];
  if (jobs.length === 0) {
    return (
      <div className="text-center py-16 text-slate-600 text-sm">
        No jobs yet. <a href="/jobs" className="text-seafoam-700 underline">Browse the job board</a>
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
              <StatusBadge status={job.status} />
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {new Date(job.scheduled_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
            <p className="text-xs text-slate-600">
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
              <a href={`/jobs/${job.id}`} className="text-xs text-seafoam-700 font-medium mt-2 block">
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
  const { t } = useTranslation();
  const { getToken } = useAppToken();
  const { data: avail, loading: loadingAvail, reload: reloadAvail } =
    useApi<{ slots: AvailabilitySlot[] }>("/cleaner-dashboard/availability");
  const { data: blocked, loading: loadingBlocked, reload: reloadBlocked } =
    useApi<{ dates: BlockedDate[] }>("/cleaner-dashboard/blocked-dates");

  const [slots, setSlots] = useState<AvailabilitySlot[]>(() =>
    DAYS.map((_, i) => ({ day_of_week: i, start_time: "08:00", end_time: "18:00", active: false }))
  );
  const [saving, setSaving] = useState(false);
  const [newBlock, setNewBlock] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [addingBlock, setAddingBlock] = useState(false);

  useEffect(() => {
    if (avail?.slots) {
      setSlots(DAYS.map((_, i) => {
        const existing = avail.slots.find((s) => s.day_of_week === i);
        return existing ?? { day_of_week: i, start_time: "08:00", end_time: "18:00", active: false };
      }));
    }
  }, [avail]);

  async function saveAvailability() {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/cleaner-dashboard/availability`, {
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
      const res = await fetch(`${API}/cleaner-dashboard/blocked-dates`, {
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
    try {
      const token = await getToken();
      const res = await fetch(`${API}/cleaner-dashboard/blocked-dates/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      reloadBlocked();
    } catch {
      toast.error("Could not remove date. Please try again.");
    }
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
            <div key={slot.day_of_week} className="flex items-center gap-3">
              <button
                onClick={() => setSlots((s) => s.map((x, j) => j === i ? { ...x, active: !x.active } : x))}
                className="flex-shrink-0"
              >
                {slot.active
                  ? <ToggleRight size={24} className="text-seafoam-700" />
                  : <ToggleLeft size={24} className="text-slate-600" />}
              </button>
              <span className="w-10 text-sm font-medium text-slate-700">{DAYS[i]}</span>
              <input
                type="time"
                disabled={!slot.active}
                value={slot.start_time}
                onChange={(e) => setSlots((s) => s.map((x, j) => j === i ? { ...x, start_time: e.target.value } : x))}
                className="rounded border border-slate-200 px-2 py-1 text-sm disabled:opacity-40"
              />
              <span className="text-slate-600 text-xs">to</span>
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
        <Button onClick={saveAvailability} loading={saving}>{t("common.save")}</Button>
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
                <span className="text-slate-600">{d.reason ?? ", "}</span>
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
  const { t } = useTranslation();
  const { getToken } = useAppToken();
  const { data, loading } = useApi<EarningSummary>("/cleaner-dashboard/earnings");
  const [connecting, setConnecting] = useState(false);

  async function setupPayouts() {
    setConnecting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/cleaner-dashboard/stripe-connect/onboard`, {
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
            <p className="font-semibold text-amber-800">{t("cleaner.earnings.setupPayouts")}</p>
            <p className="text-sm text-amber-700 mt-1">{t("cleaner.earnings.connectBank")}</p>
          </div>
          <Button size="sm" onClick={setupPayouts} loading={connecting}>{t("cleaner.earnings.setupPayouts")}</Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("cleaner.earnings.thisWeek")}  value={formatCurrency(data.thisWeek / 100)}  icon={Wallet} />
        <StatCard label={t("cleaner.earnings.thisMonth")} value={formatCurrency(data.thisMonth / 100)} icon={TrendingUp} />
        <StatCard label={t("cleaner.earnings.lastMonth")} value={formatCurrency(data.lastMonth / 100)} icon={BarChart3} />
        <StatCard label={t("cleaner.earnings.allTime")}   value={formatCurrency(data.allTime / 100)}   icon={DollarSign} />
      </div>

      {data.pendingPayout > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <strong>{formatCurrency(data.pendingPayout / 100)}</strong> {t("cleaner.earnings.pendingPayout")}
          {data.nextPayoutDate && `, ${t("cleaner.earnings.expected")} ${new Date(data.nextPayoutDate).toLocaleDateString()}`}.
        </div>
      )}

      {data.recent.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-sm font-medium text-slate-700">{t("cleaner.earnings.recentPayouts")}</div>
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
  tierProgress: number;
  nextTier: string | null;
  thisMonthJobs: number;
  totalJobs: number;
  acceptanceRate: number;
  recentReviews: { rating: number; comment: string | null; created_at: string }[];
}

const JOB_MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500];

function PerformanceTab() {
  const { data, loading } = useApi<PerformanceStats>("/cleaner-dashboard/performance-stats");

  if (loading) return <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />;
  if (!data) return null;

  const jobCount = data.thisMonthJobs ?? 0;
  const totalJobs = data.totalJobs ?? 0;
  const isNewCleaner = totalJobs === 0;

  // Milestone progress
  const nextMilestone = JOB_MILESTONES.find((m) => m > totalJobs) ?? JOB_MILESTONES[JOB_MILESTONES.length - 1];
  const prevMilestone = [...JOB_MILESTONES].reverse().find((m) => m <= totalJobs) ?? 0;
  const milestoneProgress = nextMilestone === prevMilestone ? 100
    : Math.round(((totalJobs - prevMilestone) / (nextMilestone - prevMilestone)) * 100);

  return (
    <div className="space-y-6">
      {/* Tier / hero card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-seafoam-500 via-seafoam-600 to-teal-700 p-6 text-white shadow-lg">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center justify-between mb-1">
          <div>
            <p className="text-xs text-seafoam-50 font-medium uppercase tracking-wide">Tier</p>
            <p className="text-2xl font-bold capitalize">{data.tier}</p>
          </div>
          <div className="rounded-full bg-white/20 p-3 backdrop-blur">
            <Star size={20} className="fill-white/30" />
          </div>
        </div>
        {data.nextTier && (
          <div className="relative">
            <div className="h-2 rounded-full bg-white/25 overflow-hidden mt-3">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${Math.min(data.tierProgress, 100)}%` }} />
            </div>
            <p className="text-xs text-seafoam-50 mt-1.5">
              {data.tierProgress.toFixed(0)}% towards <span className="font-medium capitalize">{data.nextTier}</span>
            </p>
          </div>
        )}
      </div>

      {/* Milestone journey */}
      <div className="rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><TrendingUp size={16} /> Jobs Milestone</h3>
          <span className="text-sm font-bold text-seafoam-700">{totalJobs} / {nextMilestone}</span>
        </div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-seafoam-600 to-teal-700 transition-all" style={{ width: `${milestoneProgress}%` }} />
        </div>
        <div className="flex justify-between text-xs text-slate-600">
          <span>{prevMilestone} jobs</span>
          <span>{nextMilestone} jobs</span>
        </div>
        <div className="flex gap-2 flex-wrap mt-1">
          {JOB_MILESTONES.map((m) => (
            <div key={m} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${totalJobs >= m ? "bg-seafoam-50 border-seafoam-200 text-seafoam-700 font-medium" : "border-slate-200 text-slate-600"}`}>
              {totalJobs >= m ? <CheckCircle2 size={10} /> : null}{m}
            </div>
          ))}
        </div>
      </div>

      {isNewCleaner ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
            <Briefcase size={22} className="text-slate-500 dark:text-slate-400" />
          </div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Stats appear after your first completed job</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">Your completion rate, rating, and earnings breakdown will show up here.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Completion Rate" value={`${data.completionRate.toFixed(1)}%`} icon={CheckCircle2} />
            <StatCard label="On-Time Rate"    value={`${data.onTimeRate.toFixed(1)}%`}    icon={Clock} />
            <StatCard label="Acceptance Rate" value={`${data.acceptanceRate.toFixed(1)}%`} icon={Briefcase} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {data.reviewCount > 0 && (
              <div className="rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Avg Rating</span>
                  <div className="flex items-center gap-0.5">
                    {[1,2,3,4,5].map((s) => (
                      <Star key={s} size={14} className={s <= Math.round(data.avgRating) ? "fill-yellow-400 text-yellow-400" : "text-slate-200"} />
                    ))}
                  </div>
                </div>
                <p className="text-3xl font-bold text-slate-800 mt-2">{Number(data.avgRating).toFixed(1)}</p>
                <p className="text-xs text-slate-600">{data.reviewCount} {data.reviewCount === 1 ? "review" : "reviews"}</p>
              </div>
            )}
            <div className="rounded-xl border border-slate-200 p-5">
              <span className="text-sm text-slate-500">Dispute Rate</span>
              <p className="text-3xl font-bold text-slate-800 mt-2">{data.disputeRate.toFixed(2)}%</p>
              <p className="text-xs text-slate-600">Lower is better</p>
            </div>
          </div>

          {data.recentReviews.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-800">Customer Reviews</h3>
              {data.recentReviews.map((r) => (
                <div key={r.created_at} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-1 mb-2">
                    {[1,2,3,4,5].map((s) => (
                      <Star key={s} size={13} className={s <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-slate-200"} />
                    ))}
                    <span className="text-xs text-slate-600 ml-2">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  {r.comment && <p className="text-sm text-slate-600 italic">"{r.comment}"</p>}
                </div>
              ))}
            </div>
          )}
        </>
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
  /** Canonical job-type preferences (standard / move_in_out / vacation_rental).
   *  The matching engine hard-filters on these; at least one required. */
  accepted_job_types: string[];
}

function SettingsTab() {
  const { t } = useTranslation();
  const { getToken } = useAppToken();
  const { data, loading, error } = useApi<CleanerSettings>("/cleaner-dashboard/settings");
  const [form, setForm] = useState<CleanerSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm({ ...data }); }, [data]);

  if (loading) return <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />;
  if (error || !form) return <p className="py-6 text-center text-sm text-slate-500">Could not load settings. Please refresh.</p>;

  function toggle(k: keyof CleanerSettings) {
    setForm((f) => f ? { ...f, [k]: !f[k as keyof typeof f] } : f);
  }

  async function save() {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/cleaner-dashboard/settings`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, preferred_language: undefined }),
      });
      if (!res.ok) throw new Error();
      toast.success("Settings saved.");
    } catch { toast.error("Save failed."); }
    finally { setSaving(false); }
  }

  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="space-y-6 max-w-xl">
      <div className="rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">{t("cleaner.dashboard.jobPreferences")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">{t("cleaner.dashboard.maxJobsPerDay")}</label>
            <input
              type="number" min={1} max={10}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.max_jobs_per_day}
              onChange={(e) => setForm((f) => f ? { ...f, max_jobs_per_day: Number(e.target.value) } : f)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">{t("cleaner.dashboard.maxDistance")}</label>
            <input
              type="number" min={1} max={100}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.max_distance_miles}
              onChange={(e) => setForm((f) => f ? { ...f, max_distance_miles: Number(e.target.value) } : f)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-500">{t("cleaningTypes.acceptTitle")}</label>
          <p className="text-xs text-slate-500">{t("cleaningTypes.acceptSubtitle")}</p>
          <AcceptedJobTypesPicker
            value={form.accepted_job_types ?? ["standard", "move_in_out", "vacation_rental"]}
            onChange={(next) => setForm((f) => (f ? { ...f, accepted_job_types: next } : f))}
          />
          <button
            type="button"
            onClick={() => setShowGuide((s) => !s)}
            className="text-xs font-medium text-seafoam-700 hover:underline"
          >
            {t("cleaningTypes.guideTitle")}
          </button>
          {showGuide && <CleaningTypeGuide className="pt-1" />}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-700">{t("cleaner.dashboard.acceptLastMinute")}</span>
          <button onClick={() => toggle("accepts_last_minute")}>
            {form.accepts_last_minute
              ? <ToggleRight size={24} className="text-seafoam-700" />
              : <ToggleLeft size={24} className="text-slate-600" />}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Bell size={16} /> {t("cleaner.notifications.title")}</h3>
        {(
          [
            ["notification_job_offer",  t("cleaner.notifications.newJobOffers")],
            ["notification_reminder",   t("cleaner.notifications.jobReminders")],
            ["notification_payout",     t("cleaner.notifications.payoutUpdates")],
            ["notification_marketing",  t("cleaner.notifications.tipsPromotions")],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm text-slate-700">{label}</span>
            <button onClick={() => toggle(key)}>
              {form[key]
                ? <ToggleRight size={24} className="text-seafoam-700" />
                : <ToggleLeft size={24} className="text-slate-600" />}
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 p-6 space-y-3">
        <h3 className="font-semibold text-slate-800">{t("settings.language")}</h3>
        <LanguageSelector />
      </div>

      <Button onClick={save} loading={saving}>{t("common.save")}</Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type DashTab = "overview" | "jobs" | "schedule" | "earnings" | "performance" | "settings";

import { LayoutDashboard } from "lucide-react";

const VALID_TABS: DashTab[] = ["overview", "jobs", "schedule", "earnings", "performance", "settings"];

export function DashboardPage() {
  const { t } = useTranslation();
  // Honor ?tab= so other pages (e.g. the retired /performance route) can deep-
  // link straight to a dashboard tab.
  const initialTab = (() => {
    const q = new URLSearchParams(window.location.search).get("tab") as DashTab | null;
    return q && VALID_TABS.includes(q) ? q : "overview";
  })();
  const [tab, setTab] = useState<DashTab>(initialTab);

  const TABS: { id: DashTab; label: string; icon: React.ElementType }[] = [
    { id: "overview",     label: t("cleaner.dashboard.tabs.overview"),     icon: LayoutDashboard },
    { id: "jobs",         label: t("cleaner.dashboard.tabs.myJobs"),       icon: Briefcase },
    { id: "schedule",     label: t("cleaner.dashboard.tabs.schedule"),     icon: CalendarDays },
    { id: "earnings",     label: t("cleaner.dashboard.tabs.earnings"),     icon: Wallet },
    { id: "performance",  label: t("cleaner.dashboard.tabs.performance"),  icon: BarChart3 },
    { id: "settings",     label: t("cleaner.dashboard.tabs.settings"),     icon: Settings },
  ];

  return (
    <DashboardShell title={t("cleaner.dashboard.title")} description={t("cleaner.dashboard.description")}>
      <div className="flex flex-wrap gap-1 border-b border-slate-200 -mb-px pb-0">
        {TABS.map((tabItem) => {
          const Icon = tabItem.icon;
          return (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={[
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === tabItem.id
                  ? "border-seafoam-700 text-seafoam-700"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              <Icon size={14} />
              {tabItem.label}
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
