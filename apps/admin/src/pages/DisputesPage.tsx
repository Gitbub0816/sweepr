import { DashboardShell, Badge, Button, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import { DataTable, type Column } from "../components/DataTable";
import { adminDisputes, type AdminDispute } from "../data/mock";

export function DisputesPage() {
  const columns: Column<AdminDispute>[] = [
    { header: "Dispute", cell: (r) => <span className="font-medium">{r.id}</span> },
    { header: "Booking", cell: (r) => r.bookingId },
    { header: "Customer", cell: (r) => r.customer },
    { header: "Reason", cell: (r) => r.reason },
    { header: "Amount", align: "right", cell: (r) => formatCurrency(r.amount) },
    {
      header: "Status",
      cell: (r) => (
        <Badge variant={r.status === "open" ? "error" : "warning"}>
          {r.status}
        </Badge>
      ),
    },
    {
      header: "",
      align: "right",
      cell: () => (
        <Button size="sm" onClick={() => toast.success("Dispute resolved")}>
          Resolve
        </Button>
      ),
    },
  ];
  return (
    <DashboardShell title="Disputes" description="Open and in-progress disputes.">
      <DataTable columns={columns} rows={adminDisputes} />
    </DashboardShell>
  );
}
