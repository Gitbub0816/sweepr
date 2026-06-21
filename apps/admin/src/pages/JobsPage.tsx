import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { DashboardShell, Input, Select, StatusBadge, Button } from "@sweepr/ui";
import { SERVICE_LABELS, formatCurrency, JOB_STATUS_LABELS } from "@sweepr/utils";
import type { JobStatus } from "@sweepr/types";
import { DataTable, type Column } from "../components/DataTable";
import { adminJobs } from "../data/mock";

const statusOptions = [
  { label: "All statuses", value: "all" },
  ...(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map((s) => ({
    label: JOB_STATUS_LABELS[s],
    value: s,
  })),
];

export function JobsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const rows = useMemo(
    () =>
      adminJobs.filter((j) => {
        const matchesQuery =
          j.id.toLowerCase().includes(query.toLowerCase()) ||
          j.address.city.toLowerCase().includes(query.toLowerCase());
        const matchesStatus = status === "all" || j.status === status;
        return matchesQuery && matchesStatus;
      }),
    [query, status]
  );

  const columns: Column<(typeof adminJobs)[number]>[] = [
    { header: "Job ID", cell: (r) => <span className="font-medium">{r.id}</span> },
    { header: "Service", cell: (r) => SERVICE_LABELS[r.serviceType] },
    { header: "City", cell: (r) => r.address.city },
    { header: "Cleaner", cell: (r) => r.cleanerId ?? "—" },
    { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { header: "Total", align: "right", cell: (r) => formatCurrency(r.quote.total) },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <Link to={`/jobs/${r.id}`}>
          <Button size="sm" variant="ghost">
            View
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <DashboardShell title="Jobs" description="All bookings across the platform.">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-10"
            placeholder="Search by ID or city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="w-56">
          <Select
            options={statusOptions}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          />
        </div>
      </div>
      <DataTable columns={columns} rows={rows} />
    </DashboardShell>
  );
}
