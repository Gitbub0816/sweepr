import { useMemo, useState } from "react";
import { DashboardShell, Badge, Button, StatCard, Select, toast } from "@sweepr/ui";
import { Wallet, Clock, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@sweepr/utils";
import { DataTable, type Column } from "../components/DataTable";
import { adminPayoutRecords, type AdminPayoutDetail } from "../data/mock";

const API_URL = import.meta.env.VITE_API_URL ?? "";

const variant: Record<string, "success" | "warning" | "error"> = {
  paid: "success",
  pending: "warning",
  failed: "error",
};

export function PayoutsPage() {
  const [records, setRecords] = useState(adminPayoutRecords);
  const [cleanerFilter, setCleanerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [releasing, setReleasing] = useState<string | null>(null);

  const cleaners = useMemo(
    () => Array.from(new Set(records.map((r) => r.cleaner))),
    [records]
  );

  const filtered = records.filter(
    (r) =>
      (cleanerFilter === "all" || r.cleaner === cleanerFilter) &&
      (statusFilter === "all" || r.status === statusFilter)
  );

  const totalPaid = records
    .filter((r) => r.status === "paid")
    .reduce((s, r) => s + r.amount, 0);
  const totalPending = records
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + r.amount, 0);

  async function release(rec: AdminPayoutDetail) {
    setReleasing(rec.id);
    try {
      if (API_URL) {
        await fetch(`${API_URL}/payments/release-payout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId: rec.bookingId }),
        });
      }
      await new Promise((r) => setTimeout(r, 500));
      setRecords((rs) =>
        rs.map((r) => (r.id === rec.id ? { ...r, status: "paid" } : r))
      );
      toast.success("Payout released.");
    } catch {
      toast.error("Could not release payout.");
    } finally {
      setReleasing(null);
    }
  }

  const columns: Column<AdminPayoutDetail>[] = [
    { header: "Cleaner", cell: (r) => <span className="font-medium">{r.cleaner}</span> },
    { header: "Booking", cell: (r) => r.bookingId },
    { header: "Date", cell: (r) => r.date },
    { header: "Amount", align: "right", cell: (r) => formatCurrency(r.amount / 100) },
    {
      header: "Status",
      cell: (r) => <Badge variant={variant[r.status] ?? "warning"}>{r.status}</Badge>,
    },
    {
      header: "",
      align: "right",
      cell: (r) =>
        r.status === "pending" ? (
          <Button
            size="sm"
            onClick={() => release(r)}
            loading={releasing === r.id}
          >
            Release payout
          </Button>
        ) : null,
    },
  ];

  return (
    <DashboardShell title="Payouts" description="Cleaner payouts and transfers.">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Paid (total)" value={formatCurrency(totalPaid / 100)} icon={CheckCircle2} />
        <StatCard label="Pending" value={formatCurrency(totalPending / 100)} icon={Clock} />
        <StatCard label="Records" value={String(records.length)} icon={Wallet} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={cleanerFilter}
          onChange={(e) => setCleanerFilter(e.target.value)}
          aria-label="Filter by cleaner"
          options={[
            { label: "All cleaners", value: "all" },
            ...cleaners.map((c) => ({ label: c, value: c })),
          ]}
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          options={[
            { label: "All statuses", value: "all" },
            { label: "Pending", value: "pending" },
            { label: "Paid", value: "paid" },
            { label: "Failed", value: "failed" },
          ]}
        />
      </div>

      <DataTable columns={columns} rows={filtered} />
    </DashboardShell>
  );
}
