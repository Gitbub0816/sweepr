import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardShell, EmptyState, toast } from "@sweepr/ui";
import { JobCard } from "../components/JobCard";
import { availableJobs, type AvailableJob } from "../data/mock";

export function JobsPage() {
  const [jobs, setJobs] = useState(availableJobs);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  const remove = (id: string) => setJobs((j) => j.filter((x) => x.id !== id));

  // Simulate a new job arriving so the board feels live (Dasher-style).
  useEffect(() => {
    const timer = setTimeout(() => {
      const incoming: AvailableJob = {
        ...availableJobs[0],
        id: `live_${Date.now()}`,
        area: "Riverside Dr",
        pay: availableJobs[0].pay + 24,
      };
      setJobs((j) => [incoming, ...j]);
      setFreshIds((s) => new Set(s).add(incoming.id));
      toast.success("New job just dropped nearby!");
    }, 6000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <DashboardShell
      title="Job Board"
      description="Accept the jobs that work for you. Full address unlocks on accept."
    >
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
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  className={
                    fresh
                      ? "rounded-2xl ring-2 ring-seafoam-400 ring-offset-2 animate-pulse"
                      : undefined
                  }
                >
                  <JobCard
                    job={job}
                    onAccept={() => {
                      toast.success(`Accepted job in ${job.area}`);
                      remove(job.id);
                    }}
                    onPass={() => remove(job.id)}
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
