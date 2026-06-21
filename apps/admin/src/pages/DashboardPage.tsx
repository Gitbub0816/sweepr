import { Briefcase, DollarSign, Sparkles, FileText } from "lucide-react";
import { DashboardShell, StatCard, Card, StatusBadge } from "@sweepr/ui";
import { formatCurrency, SERVICE_LABELS } from "@sweepr/utils";
import { adminJobs, adminApplications, adminCleaners } from "../data/mock";

export function DashboardPage() {
  const revenue = adminJobs.reduce((s, j) => s + j.quote.total, 0);
  return (
    <DashboardShell
      title="Dashboard"
      description="Platform health at a glance."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Jobs today" value={String(adminJobs.length)} icon={Briefcase} />
        <StatCard
          label="Revenue today"
          value={formatCurrency(revenue)}
          icon={DollarSign}
          delta="+8.2%"
          deltaPositive
        />
        <StatCard
          label="Active cleaners"
          value={String(adminCleaners.filter((c) => c.status === "approved").length)}
          icon={Sparkles}
        />
        <StatCard
          label="Pending applications"
          value={String(adminApplications.length)}
          icon={FileText}
        />
      </div>

      <Card>
        <h2 className="mb-4 font-semibold text-charcoal dark:text-white">
          Recent jobs
        </h2>
        <div className="space-y-2">
          {adminJobs.slice(0, 5).map((j) => (
            <div
              key={j.id}
              className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800"
            >
              <div>
                <p className="text-sm font-medium text-charcoal dark:text-white">
                  {j.id}
                </p>
                <p className="text-xs text-slate-500">
                  {SERVICE_LABELS[j.serviceType]} · {j.address.city}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <StatusBadge status={j.status} />
                <span className="text-sm font-semibold text-charcoal dark:text-white">
                  {formatCurrency(j.quote.total)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </DashboardShell>
  );
}
