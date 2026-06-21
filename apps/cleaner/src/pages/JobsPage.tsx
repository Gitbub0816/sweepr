import { useState } from "react";
import { DashboardShell, EmptyState, toast } from "@sweepr/ui";
import { JobCard } from "../components/JobCard";
import { availableJobs } from "../data/mock";

export function JobsPage() {
  const [jobs, setJobs] = useState(availableJobs);

  const remove = (id: string) => setJobs((j) => j.filter((x) => x.id !== id));

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
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onAccept={() => {
                toast.success(`Accepted job in ${job.area}`);
                remove(job.id);
              }}
              onPass={() => remove(job.id)}
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
