import { DashboardShell, Badge, Button, toast } from "@sweepr/ui";
import { DataTable, type Column } from "../components/DataTable";
import { adminApplications, type AdminCleaner } from "../data/mock";

export function ApplicationsPage() {
  const columns: Column<AdminCleaner>[] = [
    { header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Email", cell: (r) => r.email },
    {
      header: "Status",
      cell: (r) => (
        <Badge variant="warning">{r.status.replace(/_/g, " ")}</Badge>
      ),
    },
    {
      header: "",
      align: "right",
      cell: () => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => toast("Rejected")}>
            Reject
          </Button>
          <Button size="sm" onClick={() => toast.success("Approved")}>
            Approve
          </Button>
        </div>
      ),
    },
  ];
  return (
    <DashboardShell
      title="Applications"
      description="Pending cleaner applications awaiting review."
    >
      <DataTable columns={columns} rows={adminApplications} />
    </DashboardShell>
  );
}
