import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, WifiOff } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, EmptyState, toast, useReducedMotion } from "@sweepr/ui";
import type { ServiceType } from "@sweepr/types";
import { JobCard, type AvailableJob } from "../components/JobCard";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface JobRow {
  id: string;
  status: string;
  service_type: string;
  scheduled_at: string;
  total_price: number;
  cleaner_payout: number | null;
  address_city: string;
  address_state: string;
  bedrooms: number;
  bathrooms: number;
}

/** Map a real booking row to the JobCard display shape. */
function toAvailableJob(j: JobRow): AvailableJob {
  const when = new Date(j.scheduled_at);
  return {
    id: j.id,
    serviceType: (j.service_type as ServiceType) ?? "standard",
    area: [j.address_city, j.address_state].filter(Boolean).join(", ") || "Nearby",
    pay: Math.round((j.cleaner_payout ?? j.total_price * 0.8) / 100),
    distanceMi: 0,
    bedrooms: j.bedrooms ?? 0,
    bathrooms: j.bathrooms ?? 0,
    sqft: 0,
    timeSlot: when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    date: when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
  };
}

export function JobsPage() {
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
      const res = await fetch(`${API_URL}/cleaner-dashboard/my-jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as { jobs: JobRow[] };
      // The job board shows offers awaiting the cleaner's response.
      const offered = (data.jobs ?? []).filter((j) => j.status === "offered_to_cleaner");
      setJobs(offered.map(toAvailableJob));
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
      const res = await fetch(`${API_URL}/jobs/${job.id}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      toast.success(`Accepted job in ${job.area}`);
      setTimeout(() => navigate(`/jobs/${job.id}`), 700);
    } catch {
      setAcceptedId(null);
      toast.error("Could not accept job — it may have been taken.");
      load();
    }
  }

  async function handlePass(id: string) {
    setJobs((j) => j.filter((x) => x.id !== id));
    try {
      const token = await getToken();
      await fetch(`${API_URL}/jobs/${id}/decline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* best-effort */
    }
  }

  if (!online) {
    return (
      <DashboardShell
        title="Job Board"
        description="Toggle online to start receiving job offers."
        actions={<OnlineToggle online={online} onChange={setOnline} />}
      >
        <EmptyState
          icon={<WifiOff className="h-10 w-10" />}
          title="You're offline"
          description="Go online to see jobs available near you."
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title="Job Board"
      description="Accept the jobs that work for you. Full address unlocks on accept."
      actions={<OnlineToggle online={online} onChange={setOnline} />}
    >
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-seafoam-600">
        <span className="relative flex h-2.5 w-2.5">
          {!reduced && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-seafoam-400 opacity-75" />
          )}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-seafoam-500" />
        </span>
        Looking for jobs near you…
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      ) : jobs.length === 0 ? (
        <EmptyState
          title="No jobs available right now"
          description="Check back soon — new offers appear throughout the day."
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
  return (
    <button
      type="button"
      onClick={() => onChange(!online)}
      aria-pressed={online}
      aria-label={online ? "Go offline" : "Go online"}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
        online
          ? "bg-seafoam-500 text-white"
          : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      {online ? <Radio className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
      {online ? "You're Online" : "You're Offline"}
    </button>
  );
}
