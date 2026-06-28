import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { DashboardShell, Badge, Button, EmptyState } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import { DataTable, type Column } from "../components/DataTable";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Dispute {
  id: string;
  booking_id: string;
  reason: string | null;
  status: string;
  total_price: number | null;
  customer_first: string | null;
  customer_last: string | null;
  cleaner_first: string | null;
  cleaner_last: string | null;
}

export function DisputesPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/admin/disputes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRows(((await res.json()) as { disputes: Dispute[] }).disputes ?? []);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  const columns: Column<Dispute>[] = [
    { header: "Booking", cell: (r) => <span className="font-mono text-xs">{r.booking_id?.slice(0, 8)}…</span> },
    { header: "Customer", cell: (r) => [r.customer_first, r.customer_last].filter(Boolean).join(" ") || "—" },
    { header: "Cleaner", cell: (r) => [r.cleaner_first, r.cleaner_last].filter(Boolean).join(" ") || "Unassigned" },
    { header: "At stake", align: "right", cell: (r) => r.total_price ? formatCurrency(r.total_price / 100) : "—" },
    {
      header: "Status",
      cell: (r) => (
        <Badge variant={r.status === "open" ? "error" : r.status === "investigating" ? "warning" : "success"}>
          {r.status}
        </Badge>
      ),
    },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate(`/disputes/${r.id}`)}
        >
          Review
        </Button>
      ),
    },
  ];

  return (
    <DashboardShell
      title="Disputes"
      description="Open and in-progress disputes — live from Neon."
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
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-10 w-10 text-seafoam-500" />}
          title="No open disputes — great sign! 🎉"
          description="When a customer or cleaner raises an issue, it'll show up here."
        />
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}
    </DashboardShell>
  );
}
