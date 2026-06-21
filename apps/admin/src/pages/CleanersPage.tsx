import { Star } from "lucide-react";
import { DashboardShell, Badge } from "@sweepr/ui";
import { DataTable, type Column } from "../components/DataTable";
import { adminCleaners, type AdminCleaner } from "../data/mock";

const statusVariant: Record<string, "success" | "warning" | "error" | "default"> = {
  approved: "success",
  in_review: "warning",
  pending_application: "warning",
  suspended: "error",
  rejected: "error",
};

export function CleanersPage() {
  const columns: Column<AdminCleaner>[] = [
    { header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Email", cell: (r) => r.email },
    {
      header: "Rating",
      cell: (r) => (
        <span className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-amberaccent text-amberaccent" />
          {r.rating}
        </span>
      ),
    },
    { header: "Jobs", cell: (r) => r.jobs },
    {
      header: "Status",
      cell: (r) => (
        <Badge variant={statusVariant[r.status] ?? "default"}>
          {r.status.replace(/_/g, " ")}
        </Badge>
      ),
    },
  ];
  return (
    <DashboardShell title="Cleaners" description="Approved and active cleaners.">
      <DataTable columns={columns} rows={adminCleaners} />
    </DashboardShell>
  );
}
