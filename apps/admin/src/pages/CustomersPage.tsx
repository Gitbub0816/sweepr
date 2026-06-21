import { DashboardShell } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import { DataTable, type Column } from "../components/DataTable";
import { adminCustomers, type AdminCustomer } from "../data/mock";

export function CustomersPage() {
  const columns: Column<AdminCustomer>[] = [
    { header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Email", cell: (r) => r.email },
    { header: "Bookings", cell: (r) => r.bookings },
    { header: "Lifetime spend", align: "right", cell: (r) => formatCurrency(r.spend) },
    { header: "Joined", cell: (r) => r.joined },
  ];
  return (
    <DashboardShell title="Customers" description="All registered customers.">
      <DataTable columns={columns} rows={adminCustomers} />
    </DashboardShell>
  );
}
