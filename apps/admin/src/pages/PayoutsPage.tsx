import { DashboardShell, Badge } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import { DataTable, type Column } from "../components/DataTable";
import { adminPayouts, type AdminPayout } from "../data/mock";

const variant: Record<string, "success" | "warning" | "info" | "default"> = {
  paid: "success",
  in_transit: "info",
  pending: "warning",
  failed: "default",
};

export function PayoutsPage() {
  const columns: Column<AdminPayout>[] = [
    { header: "Payout", cell: (r) => <span className="font-medium">{r.id}</span> },
    { header: "Cleaner", cell: (r) => r.cleaner },
    { header: "Period", cell: (r) => r.period },
    { header: "Amount", align: "right", cell: (r) => formatCurrency(r.amount) },
    {
      header: "Status",
      cell: (r) => (
        <Badge variant={variant[r.status] ?? "default"}>
          {r.status.replace(/_/g, " ")}
        </Badge>
      ),
    },
  ];
  return (
    <DashboardShell title="Payouts" description="Cleaner payouts by period.">
      <DataTable columns={columns} rows={adminPayouts} />
    </DashboardShell>
  );
}
