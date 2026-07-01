import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { Search, RefreshCw } from "lucide-react";
import { DashboardShell, Input, Select, Button, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import { DataTable, type Column } from "../components/DataTable";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Job {
  id: string;
  status: string;
  service_type: string;
  scheduled_for: string | null;
  created_at: string;
  address_line1: string | null;
  address_city: string | null;
  address_state: string | null;
  customer_email: string | null;
  cleaner_first: string | null;
  cleaner_last: string | null;
  amount_cents: number | null;
}

const STATUS_COLOR: Record<string, string> = {
  matching: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  in_progress: "bg-seafoam-100 text-seafoam-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled_by_customer: "bg-slate-100 text-slate-500",
  cancelled_by_cleaner: "bg-slate-100 text-slate-500",
  disputed: "bg-red-100 text-red-700",
};

const STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Matching", value: "matching" },
  { label: "Confirmed", value: "confirmed" },
  { label: "In progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Disputed", value: "disputed" },
  { label: "Cancelled", value: "cancelled_by_customer" },
];

export function JobsPage() {
  const { getToken } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ limit: "200" });
      if (status) params.set("status", status);
      const res = await fetch(`${API_URL}/admin/jobs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json() as { jobs: Job[]; total: number };
        setJobs(d.jobs ?? []);
        setTotal(d.total ?? 0);
      } else {
        toast.error("Failed to load jobs");
      }
    } catch {
      toast.error("Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [getToken, status]);

  useEffect(() => { void load(); }, [load]);

  const filtered = jobs.filter((j) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      j.id.toLowerCase().includes(q) ||
      (j.address_city ?? "").toLowerCase().includes(q) ||
      (j.customer_email ?? "").toLowerCase().includes(q)
    );
  });

  const columns: Column<Job>[] = [
    { header: "Job ID", cell: (r) => <span className="font-mono text-xs text-slate-600">{r.id.slice(0, 8)}…</span> },
    { header: "Service", cell: (r) => r.service_type?.replace(/_/g, " ") ?? "—" },
    { header: "Customer", cell: (r) => r.customer_email ?? "—" },
    { header: "Cleaner", cell: (r) => [r.cleaner_first, r.cleaner_last].filter(Boolean).join(" ") || "Unassigned" },
    { header: "City", cell: (r) => [r.address_city, r.address_state].filter(Boolean).join(", ") || "—" },
    { header: "Scheduled", cell: (r) => r.scheduled_for ? new Date(r.scheduled_for).toLocaleDateString() : "—" },
    {
      header: "Status",
      cell: (r) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.status] ?? "bg-slate-100 text-slate-700"}`}>
          {r.status?.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      header: "Total",
      align: "right",
      cell: (r) => r.amount_cents ? formatCurrency(r.amount_cents / 100) : "—",
    },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <Link to={`/jobs/${r.id}`}>
          <Button size="sm" variant="ghost">View</Button>
        </Link>
      ),
    },
  ];

  return (
    <DashboardShell
      title="Jobs"
      description={`${total} booking${total !== 1 ? "s" : ""} total — live from Neon.`}
      actions={
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-10"
            placeholder="Search by ID, city, or customer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="w-56">
          <Select
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          />
        </div>
      </div>
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-seafoam-400 border-t-transparent" />
        </div>
      ) : (
        <DataTable columns={columns} rows={filtered} />
      )}
    </DashboardShell>
  );
}
