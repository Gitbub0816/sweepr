import { useNavigate } from "react-router-dom";
import { DashboardShell, Badge, Button } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import { DataTable, type Column } from "../components/DataTable";
import { adminDisputeDetails, type AdminDisputeDetail } from "../data/mock";

export function DisputesPage() {
  const navigate = useNavigate();
  const rows = Object.values(adminDisputeDetails);

  const columns: Column<AdminDisputeDetail>[] = [
    { header: "Booking", cell: (r) => <span className="font-medium">{r.bookingId}</span> },
    { header: "Customer", cell: (r) => r.customer },
    { header: "Cleaner", cell: (r) => r.cleaner },
    { header: "At stake", align: "right", cell: (r) => formatCurrency(r.amount) },
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
    <DashboardShell title="Disputes" description="Open and in-progress disputes.">
      <DataTable columns={columns} rows={rows} />
    </DashboardShell>
  );
}
