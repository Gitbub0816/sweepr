import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { Inbox, RefreshCw } from "lucide-react";
import { DashboardShell, Badge, Button, EmptyState } from "@sweepr/ui";
import { DataTable, type Column } from "../components/DataTable";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Application {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string;
  city: string | null;
  state: string | null;
  created_at: string;
}

export function ApplicationsPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/admin/cleaners?status=pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setApps(((await res.json()) as { cleaners: Application[] }).cleaners);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  const columns: Column<Application>[] = [
    {
      header: "Name",
      cell: (r) => (
        <span className="font-medium text-charcoal dark:text-white">
          {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
        </span>
      ),
    },
    { header: "Email", cell: (r) => r.email ?? "—" },
    { header: "Location", cell: (r) => [r.city, r.state].filter(Boolean).join(", ") || "—" },
    { header: "Applied", cell: (r) => new Date(r.created_at).toLocaleDateString() },
    {
      header: "Status",
      cell: (r) => <Badge variant="warning">{r.status.replace(/_/g, " ")}</Badge>,
    },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <Button size="sm" variant="secondary" onClick={() => navigate(`/applications/${r.id}`)}>
          Review
        </Button>
      ),
    },
  ];

  return (
    <DashboardShell
      title="Applications"
      description="Pending cleaner applications awaiting review — live from Neon."
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
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-seafoam-400 border-t-transparent" />
        </div>
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-10 w-10 text-seafoam-500" />}
          title="All caught up on applications"
          description="New cleaner applications will appear here for review."
        />
      ) : (
        <DataTable columns={columns} rows={apps} />
      )}
    </DashboardShell>
  );
}
