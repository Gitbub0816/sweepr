import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { RefreshCw } from "lucide-react";
import { DashboardShell, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import { DataTable, type Column } from "../components/DataTable";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Customer {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  booking_count: number;
  lifetime_cents: number;
  created_at: string;
}

export function CustomersPage() {
  const { getToken } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/admin/customers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCustomers(((await res.json()) as { customers: Customer[] }).customers);
      } else {
        toast.error("Failed to load customers");
      }
    } catch {
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  const columns: Column<Customer>[] = [
    {
      header: "Name",
      cell: (r) => (
        <span className="font-medium text-charcoal dark:text-white">
          {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
        </span>
      ),
    },
    { header: "Email", cell: (r) => r.email ?? "—" },
    { header: "Bookings", cell: (r) => r.booking_count },
    {
      header: "Lifetime spend",
      align: "right",
      cell: (r) => r.lifetime_cents > 0 ? formatCurrency(r.lifetime_cents / 100) : "—",
    },
    { header: "Joined", cell: (r) => new Date(r.created_at).toLocaleDateString() },
  ];

  return (
    <DashboardShell
      title="Customers"
      description={`${customers.length} registered customer${customers.length !== 1 ? "s" : ""} — live from Neon.`}
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
      ) : (
        <DataTable columns={columns} rows={customers} />
      )}
    </DashboardShell>
  );
}
