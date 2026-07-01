import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { Star, RefreshCw } from "lucide-react";
import { DashboardShell, Badge, Button, toast } from "@sweepr/ui";
import { DataTable, type Column } from "../components/DataTable";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Cleaner {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string;
  city: string | null;
  state: string | null;
  stripe_connect_status: string | null;
  completed_jobs: number;
  avg_rating: number | null;
  created_at: string;
}

const statusVariant: Record<string, "success" | "warning" | "error" | "default"> = {
  approved: "success",
  pending: "warning",
  in_review: "warning",
  suspended: "error",
  rejected: "error",
};

const TABS = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Suspended", value: "suspended" },
  { label: "Rejected", value: "rejected" },
];

export function CleanersPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (tab) params.set("status", tab);
      const res = await fetch(`${API_URL}/admin/cleaners?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCleaners(((await res.json()) as { cleaners: Cleaner[] }).cleaners);
      } else {
        toast.error("Failed to load cleaners");
      }
    } catch {
      toast.error("Failed to load cleaners");
    } finally {
      setLoading(false);
    }
  }, [getToken, tab]);

  useEffect(() => { void load(); }, [load]);

  const columns: Column<Cleaner>[] = [
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
    {
      header: "Rating",
      cell: (r) =>
        r.avg_rating ? (
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {r.avg_rating.toFixed(1)}
          </span>
        ) : (
          <span className="text-slate-400">No reviews</span>
        ),
    },
    { header: "Jobs", cell: (r) => r.completed_jobs },
    {
      header: "Stripe",
      cell: (r) => (
        <span className={`text-xs ${r.stripe_connect_status === "active" ? "text-emerald-600" : "text-slate-400"}`}>
          {r.stripe_connect_status ?? "not connected"}
        </span>
      ),
    },
    {
      header: "Status",
      cell: (r) => <Badge variant={statusVariant[r.status] ?? "default"}>{r.status.replace(/_/g, " ")}</Badge>,
    },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <Button size="sm" variant="secondary" onClick={() => navigate(`/applications/${r.id}`)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <DashboardShell
      title="Cleaners"
      description={`${cleaners.length} cleaner${cleaners.length !== 1 ? "s" : ""} — live from Neon.`}
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
      <div className="mb-4 flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              tab === t.value
                ? "bg-seafoam-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-seafoam-400 border-t-transparent" />
        </div>
      ) : (
        <DataTable columns={columns} rows={cleaners} />
      )}
    </DashboardShell>
  );
}
