import { useNavigate } from "react-router-dom";
import { Inbox } from "lucide-react";
import { DashboardShell, Badge, Button, EmptyState } from "@sweepr/ui";
import { DataTable, type Column } from "../components/DataTable";
import { adminApplications, type AdminCleaner } from "../data/mock";

export function ApplicationsPage() {
  const navigate = useNavigate();
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
      cell: (r) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate(`/applications/${r.id}`)}
        >
          Review
        </Button>
      ),
    },
  ];
  return (
    <DashboardShell
      title="Applications"
      description="Pending cleaner applications awaiting review."
    >
      {adminApplications.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-10 w-10 text-seafoam-500" />}
          title="All caught up on applications"
          description="New cleaner applications will appear here for review."
        />
      ) : (
        <DataTable columns={columns} rows={adminApplications} />
      )}
    </DashboardShell>
  );
}
