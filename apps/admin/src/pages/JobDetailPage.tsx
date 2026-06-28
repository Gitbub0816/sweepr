import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  DashboardShell,
  Card,
  StatusBadge,
  Select,
  Button,
  ErrorState,
  toast,
} from "@sweepr/ui";
import {
  SERVICE_LABELS,
  JOB_STATUS_LABELS,
  formatCurrency,
  formatDateTime,
} from "@sweepr/utils";
import type { JobStatus, ServiceType } from "@sweepr/types";

const API_URL = import.meta.env.VITE_API_URL ?? "";

const statusOptions = (Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map(
  (s) => ({ label: JOB_STATUS_LABELS[s], value: s })
);

interface Job {
  id: string;
  status: string;
  service_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  scheduled_at: string | null;
  total_price: number | null;
  cleaner_id: string | null;
  customer_first: string | null;
  customer_last: string | null;
  customer_email: string | null;
  street: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

interface CleanerOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avg_rating: number | null;
}

export function JobDetailPage() {
  const { id } = useParams();
  const { getToken } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [cleaners, setCleaners] = useState<CleanerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<JobStatus>("draft");
  const [cleaner, setCleaner] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const token = await getToken();
      const [jobRes, clRes] = await Promise.all([
        fetch(`${API_URL}/admin/jobs/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/admin/cleaners?status=approved`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (jobRes.ok) {
        const j = ((await jobRes.json()) as { job: Job }).job;
        setJob(j);
        setStatus((j.status as JobStatus) ?? "draft");
        setCleaner(j.cleaner_id ?? "");
      }
      if (clRes.ok) setCleaners(((await clRes.json()) as { cleaners: CleanerOption[] }).cleaners ?? []);
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!job) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/admin/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, cleaner_id: cleaner || null }),
      });
      if (!res.ok) throw new Error("failed");
      toast.success("Job updated");
    } catch {
      toast.error("Could not update job.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell title="Job">
        <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </DashboardShell>
    );
  }

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

  const customer = [job.customer_first, job.customer_last].filter(Boolean).join(" ") || job.customer_email || "—";

  return (
    <DashboardShell
      title={job.id.slice(0, 8) + "…"}
      description={job.service_type ? SERVICE_LABELS[job.service_type as ServiceType] ?? job.service_type : "Job"}
      actions={<StatusBadge status={status} />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-charcoal dark:text-white">
              Customer &amp; location
            </h2>
            <p className="text-sm text-slate-500">Customer: {customer}</p>
            {job.scheduled_at && (
              <p className="text-sm text-slate-500">Scheduled: {formatDateTime(job.scheduled_at)}</p>
            )}
            <p className="text-sm text-slate-500">
              {[job.street, job.unit, job.city, job.state, job.zip].filter(Boolean).join(", ") || "—"}
            </p>
            <p className="text-sm text-slate-500">
              {job.bedrooms ?? "—"} bd · {job.bathrooms ?? "—"} ba · {job.sqft ?? "—"} sqft
            </p>
            {job.total_price != null && (
              <p className="text-sm font-medium text-charcoal dark:text-white">
                Total: {formatCurrency(job.total_price / 100)}
              </p>
            )}
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
              placeholder="Unassigned"
              options={cleaners.map((c) => ({
                label: `${[c.first_name, c.last_name].filter(Boolean).join(" ") || c.id.slice(0, 8)}${c.avg_rating ? ` (${c.avg_rating}★)` : ""}`,
                value: c.id,
              }))}
              value={cleaner}
              onChange={(e) => setCleaner(e.target.value)}
            />
            <Button onClick={save} loading={saving}>
              Save changes
            </Button>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
