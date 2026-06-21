import { Link } from "react-router-dom";
import { useState } from "react";
import { Briefcase, Wallet, Star, Power } from "lucide-react";
import {
  DashboardShell,
  StatCard,
  Card,
  Button,
  Badge,
} from "@sweepr/ui";
import { SERVICE_LABELS, formatCurrency } from "@sweepr/utils";
import { todayJobs, weeklyEarnings } from "../data/mock";

export function HomePage() {
  const [online, setOnline] = useState(true);
  const weekTotal = weeklyEarnings.reduce((s, d) => s + d.amount, 0);

  return (
    <DashboardShell
      title="Good morning, Alex"
      description="Here's your day at a glance."
      actions={
        <Button
          variant={online ? "primary" : "secondary"}
          onClick={() => setOnline((o) => !o)}
        >
          <Power className="h-4 w-4" />
          {online ? "Online" : "Offline"}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Jobs today"
          value={String(todayJobs.length)}
          icon={Briefcase}
        />
        <StatCard
          label="Earnings this week"
          value={formatCurrency(weekTotal)}
          icon={Wallet}
          delta="+12% vs last week"
          deltaPositive
        />
        <StatCard label="Rating" value="4.9" icon={Star} />
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-charcoal dark:text-white">
            Today's jobs
          </h2>
          <Link to="/jobs">
            <Button variant="ghost" size="sm">
              Find more
            </Button>
          </Link>
        </div>
        <div className="space-y-3">
          {todayJobs.map((j) => (
            <div
              key={j.id}
              className="flex items-center gap-4 rounded-xl border border-slate-100 p-3 dark:border-slate-800"
            >
              <Badge variant="info">{j.timeSlot}</Badge>
              <div className="flex-1">
                <p className="text-sm font-medium text-charcoal dark:text-white">
                  {SERVICE_LABELS[j.serviceType]} · {j.customer}
                </p>
                <p className="text-xs text-slate-500">{j.address}</p>
              </div>
              <span className="font-semibold text-charcoal dark:text-white">
                {formatCurrency(j.pay)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </DashboardShell>
  );
}
