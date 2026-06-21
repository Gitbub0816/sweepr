import { useState } from "react";
import { Wallet, TrendingUp, Briefcase } from "lucide-react";
import { DashboardShell, StatCard, Card, Button } from "@sweepr/ui";
import { formatCurrency, cn } from "@sweepr/utils";
import { weeklyEarnings, monthlyEarnings } from "../data/mock";

export function EarningsPage() {
  const [range, setRange] = useState<"week" | "month">("week");
  const data =
    range === "week"
      ? weeklyEarnings.map((d) => ({ label: d.day, amount: d.amount }))
      : monthlyEarnings;
  const total = data.reduce((s, d) => s + d.amount, 0);
  const max = Math.max(...data.map((d) => d.amount), 1);

  return (
    <DashboardShell
      title="Earnings"
      description="Track your payouts and performance."
      actions={
        <div className="flex rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
          {(["week", "month"] as const).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "primary" : "ghost"}
              onClick={() => setRange(r)}
            >
              {r === "week" ? "Weekly" : "Monthly"}
            </Button>
          ))}
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={range === "week" ? "This week" : "This month"}
          value={formatCurrency(total)}
          icon={Wallet}
        />
        <StatCard
          label="Avg / job"
          value={formatCurrency(Math.round(total / 12))}
          icon={TrendingUp}
        />
        <StatCard label="Jobs done" value="24" icon={Briefcase} />
      </div>

      <Card>
        <h2 className="mb-6 font-semibold text-charcoal dark:text-white">
          {range === "week" ? "Daily earnings" : "Weekly earnings"}
        </h2>
        <div className="flex h-48 items-end gap-3">
          {data.map((d) => (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
              <div
                className={cn(
                  "w-full rounded-t-lg bg-seafoam-500 transition-all",
                  d.amount === 0 && "bg-slate-200 dark:bg-slate-700"
                )}
                style={{ height: `${(d.amount / max) * 100}%`, minHeight: 4 }}
                title={formatCurrency(d.amount)}
              />
              <span className="text-xs text-slate-400">{d.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </DashboardShell>
  );
}
