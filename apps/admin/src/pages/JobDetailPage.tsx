import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  DashboardShell,
  Card,
  StatusBadge,
  Select,
  Button,
  PriceSummary,
  ErrorState,
  toast,
} from "@sweepr/ui";
import {
  SERVICE_LABELS,
  JOB_STATUS_LABELS,
} from "@sweepr/utils";
import type { JobStatus } from "@sweepr/types";
import { adminJobs, adminCleaners } from "../data/mock";

const statusOptions = (Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map(
  (s) => ({ label: JOB_STATUS_LABELS[s], value: s })
);

export function JobDetailPage() {
  const { id } = useParams();
  const job = adminJobs.find((j) => j.id === id);
  const [status, setStatus] = useState<JobStatus>(job?.status ?? "draft");
  const [cleaner, setCleaner] = useState(job?.cleanerId ?? "");

  if (!job) {
    return (
      <ErrorState
        title="Job not found"
        action={
          <Link to="/jobs">
            <Button variant="secondary">Back to jobs</Button>
          </Link>
        }
      />
    );
  }

  return (
    <DashboardShell
      title={job.id}
      description={SERVICE_LABELS[job.serviceType]}
      actions={<StatusBadge status={status} />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="text-sm font-semibold text-charcoal dark:text-white">
              Customer &amp; location
            </h2>
            <p className="text-sm text-slate-500">Customer: {job.customerId}</p>
            <p className="text-sm text-slate-500">
              {job.address.line1}, {job.address.city}, {job.address.state}{" "}
              {job.address.zip}
            </p>
            <p className="text-sm text-slate-500">
              {job.home.bedrooms} bd · {job.home.bathrooms} ba · {job.home.sqft}{" "}
              sqft
            </p>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-sm font-semibold text-charcoal dark:text-white">
              Admin controls
            </h2>
            <Select
              label="Status override"
              options={statusOptions}
              value={status}
              onChange={(e) => setStatus(e.target.value as JobStatus)}
            />
            <Select
              label="Reassign cleaner"
              placeholder="Select a cleaner"
              options={adminCleaners.map((c) => ({
                label: `${c.name} (${c.rating}★)`,
                value: c.id,
              }))}
              value={cleaner}
              onChange={(e) => setCleaner(e.target.value)}
            />
            <Button onClick={() => toast.success("Job updated")}>
              Save changes
            </Button>
          </Card>
        </div>

        <PriceSummary quote={job.quote} title="Job total" />
      </div>
    </DashboardShell>
  );
}
