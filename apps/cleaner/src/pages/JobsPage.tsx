/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, WifiOff } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { DashboardShell, EmptyState, toast, useReducedMotion } from "@sweepr/ui";
import type { ServiceType } from "@sweepr/types";
import { JobCard, type AvailableJob } from "../components/JobCard";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface JobRow {
  id: string;
  service_type: string;
  scheduled_at: string;
  arrival_window_start?: string | null;
  arrival_window_end?: string | null;
  total_price: number;
  cleaner_payout: number | null;
  address_city: string;
  address_state: string;
  bedrooms: number;
  bathrooms: number;
}

/** "HH:MM:SS" -> "8:00 AM" */
function formatTimeOfDay(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? "0");
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

/** Map a real assignment-queue offer row to the JobCard display shape. */
function toAvailableJob(j: JobRow): AvailableJob {
  const when = new Date(j.scheduled_at);
  const timeSlot =
    j.arrival_window_start && j.arrival_window_end
      ? `${formatTimeOfDay(j.arrival_window_start)} – ${formatTimeOfDay(j.arrival_window_end)}`
      : when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return {
    id: j.id,
    serviceType: (j.service_type as ServiceType) ?? "standard",
    // Full street address unlocks on accept — the offer endpoint only returns
    // city/state until then.
    area: [j.address_city, j.address_state].filter(Boolean).join(", ") || "Nearby",
    pay: Math.round((j.cleaner_payout ?? j.total_price * 0.8) / 100),
    distanceMi: 0,
    bedrooms: j.bedrooms ?? 0,
    bathrooms: j.bathrooms ?? 0,
    sqft: 0,
    timeSlot,
    date: when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
  };
}

export function JobsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { getToken } = useAuth();
  const [online, setOnline] = useState(true);
  const [jobs, setJobs] = useState<AvailableJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!API_URL) { setJobs([]); setLoading(false); return; }
    setLoading(true);
    try {
      const token = await getToken();
      // Offers live in assignment_queue (per-cleaner rows) until accepted, not
      // on bookings.cleaner_id — /available-offers reads that table directly.
      const res = await fetch(`${API_URL}/cleaner-dashboard/available-offers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as { jobs: JobRow[] };
      setJobs((data.jobs ?? []).map(toAvailableJob));
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!online) return;
    load();
    const timer = setInterval(load, 30_000); // poll for new offers
    return () => clearInterval(timer);
  }, [online, load]);

  async function handleAccept(job: AvailableJob) {
    setAcceptedId(job.id);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/cleaner-dashboard/jobs/${job.id}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
        setAcceptedId(null);
        if (data?.code === "insurance_required") {
          toast.error("Valid insurance is required before accepting jobs.");
          navigate("/insurance");
        } else {
          toast.error("Could not accept job, it may have been taken.");
          load();
        }
        return;
      }
      toast.success(`Accepted job in ${job.area}`);
      setTimeout(() => navigate(`/jobs/${job.id}`), 700);
    } catch {
      setAcceptedId(null);
      toast.error("Could not accept job, it may have been taken.");
      load();
    }
  }

  async function handlePass(id: string) {
    setJobs((j) => j.filter((x) => x.id !== id));
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/cleaner-dashboard/jobs/${id}/decline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      // One free decline per day; further declines lower your acceptance rate.
      const data = (await res.json().catch(() => ({}))) as { declineWasFree?: boolean };
      if (data.declineWasFree === false) {
        toast.error("That's a second decline today, it lowers your acceptance rate and your odds on future jobs.");
      } else {
        toast("Passed. You have 1 free decline a day; more will affect your acceptance rate.");
      }
    } catch {
      /* best-effort */
    }
  }

  if (!online) {
    return (
      <DashboardShell
        title={t("cleaner.jobs.title")}
        description={t("cleaner.jobs.description")}
        actions={<OnlineToggle online={online} onChange={setOnline} />}
      >
        <EmptyState
          icon={<WifiOff className="h-10 w-10" />}
          title={t("cleaner.jobs.youreOffline")}
          description={t("cleaner.jobs.goOnlineToSeeJobs")}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title={t("cleaner.jobs.title")}
      description={t("cleaner.jobs.description")}
      actions={<OnlineToggle online={online} onChange={setOnline} />}
    >
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-seafoam-700">
        <span className="relative flex h-2.5 w-2.5">
          {!reduced && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-seafoam-400 opacity-75" />
          )}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-seafoam-500" />
        </span>
        {t("cleaner.jobs.lookingForJobs")}
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      ) : jobs.length === 0 ? (
        <EmptyState
          title={t("cleaner.jobs.noJobsTitle")}
          description={t("cleaner.jobs.noJobsDesc")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {jobs.map((job) => (
              <motion.div
                key={job.id}
                layout={!reduced}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, x: -60, transition: { duration: 0.2 } }}
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 28 }}
              >
                <JobCard
                  job={job}
                  accepted={acceptedId === job.id}
                  onAccept={() => handleAccept(job)}
                  onPass={() => handlePass(job.id)}
                  onExpire={() => handlePass(job.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </DashboardShell>
  );
}

function OnlineToggle({
  online,
  onChange,
}: {
  online: boolean;
  onChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onChange(!online)}
      aria-pressed={online}
      aria-label={online ? "Go offline" : "Go online"}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
        online
          ? "bg-seafoam-700 text-white"
          : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      {online ? <Radio className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
      {online ? t("cleaner.jobs.youreOnline") : t("cleaner.jobs.youreOffline")}
    </button>
  );
}
