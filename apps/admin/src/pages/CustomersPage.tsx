import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { RefreshCw, X } from "lucide-react";
import { DashboardShell, toast, Badge } from "@sweepr/ui";
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
  sms_consent: boolean;
  sms_consent_at: string | null;
  sms_consent_source: string | null;
  sms_consent_version: string | null;
  sms_consent_ip: string | null;
  sms_consent_user_agent: string | null;
  sms_consent_revoked_at: string | null;
}

function ConsentDetail({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const rows: Array<[string, string]> = [
    ["Status", customer.sms_consent ? "✅ Granted" : "❌ Revoked / never granted"],
    ["Consent date", customer.sms_consent_at ? new Date(customer.sms_consent_at).toLocaleString() : "—"],
    ["Consent source", customer.sms_consent_source ?? "—"],
    ["Consent version", customer.sms_consent_version ?? "—"],
    ["IP address", customer.sms_consent_ip ?? "—"],
    ["User agent", customer.sms_consent_user_agent ?? "—"],
    ["Revoked date", customer.sms_consent_revoked_at ? new Date(customer.sms_consent_revoked_at).toLocaleString() : "—"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-charcoal dark:text-white">
            SMS Consent — {[customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.email}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <dl className="space-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-slate-400">{label}</dt>
              <dd className="break-all text-charcoal dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function CustomersPage() {
  const { getToken } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Customer | null>(null);

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
      header: "SMS Consent",
      cell: (r) => (
        <button onClick={() => setDetail(r)} title="View consent audit detail">
          <Badge variant={r.sms_consent ? "success" : "default"}>
            {r.sms_consent ? "✅ Granted" : "❌ Revoked"}
          </Badge>
        </button>
      ),
    },
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
      {detail && <ConsentDetail customer={detail} onClose={() => setDetail(null)} />}
    </DashboardShell>
  );
}
