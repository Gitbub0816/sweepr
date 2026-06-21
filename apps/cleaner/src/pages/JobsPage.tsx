import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, WifiOff } from "lucide-react";
import { DashboardShell, EmptyState, toast, useReducedMotion } from "@sweepr/ui";
import { JobCard } from "../components/JobCard";
import { availableJobs, type AvailableJob } from "../data/mock";

const AREAS = [
  "Riverside Dr",
  "Bankers Hill",
  "Golden Hill",
  "University Heights",
  "Normal Heights",
];

function randomDistance() {
  return Math.round((2 + Math.random() * 13) * 10) / 10;
}

export function JobsPage() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [online, setOnline] = useState(true);
  const [jobs, setJobs] = useState<AvailableJob[]>(availableJobs);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [acceptedId, setAcceptedId] = useState<string | null>(null);
  const counter = useRef(0);

  const remove = (id: string) => setJobs((j) => j.filter((x) => x.id !== id));

  // Real-time job simulator — drop a new job every 30s while online (dev feel).
  useEffect(() => {
    if (!online || !import.meta.env.DEV) return;
    const timer = setInterval(() => {
      counter.current += 1;
      const base = availableJobs[counter.current % availableJobs.length];
      const incoming: AvailableJob = {
        ...base,
        id: `live_${Date.now()}`,
        area: `${AREAS[counter.current % AREAS.length]}, San Diego`,
        distanceMi: randomDistance(),
        pay: base.pay + Math.round(Math.random() * 30),
      };
      setJobs((j) => [incoming, ...j]);
      setFreshIds((s) => new Set(s).add(incoming.id));
      toast.success("New job just dropped nearby!");
    }, 30_000);
    return () => clearInterval(timer);
  }, [online]);

  const handleAccept = (job: AvailableJob) => {
    setAcceptedId(job.id);
    toast.success(`Accepted job in ${job.area}`);
    setTimeout(() => {
      navigate(`/jobs/${job.id}`);
    }, 900);
  };

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

      {jobs.length === 0 ? (
        <EmptyState
          title="No jobs available right now"
          description="Check back soon — new jobs appear throughout the day."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {jobs.map((job) => {
              const fresh = freshIds.has(job.id);
              return (
                <motion.div
                  key={job.id}
                  layout={!reduced}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
                  animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                  exit={
                    reduced
                      ? { opacity: 0 }
                      : { opacity: 0, x: -60, transition: { duration: 0.2 } }
                  }
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 320, damping: 28 }
                  }
                  className={
                    fresh && !reduced
                      ? "rounded-2xl ring-2 ring-seafoam-400 ring-offset-2"
                      : undefined
                  }
                >
                  <JobCard
                    job={job}
                    accepted={acceptedId === job.id}
                    onAccept={() => handleAccept(job)}
                    onPass={() => remove(job.id)}
                    onExpire={() => undefined}
                  />
                </motion.div>
              );
            })}
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
