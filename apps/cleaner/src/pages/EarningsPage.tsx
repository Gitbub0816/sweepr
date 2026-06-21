import { useState } from "react";
import { Wallet, TrendingUp, Briefcase, Building2, ArrowRight } from "lucide-react";
import { DashboardShell, StatCard, Card, Button, toast } from "@sweepr/ui";
import { formatCurrency, cn } from "@sweepr/utils";
import { weeklyEarnings, monthlyEarnings } from "../data/mock";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export function EarningsPage() {
  const [range, setRange] = useState<"week" | "month">("week");
  // Mock connect status — in production this comes from /cleaners/stripe-connect/status.
  const [stripeConnectEnabled, setStripeConnectEnabled] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const data =
    range === "week"
      ? weeklyEarnings.map((d) => ({ label: d.day, amount: d.amount }))
      : monthlyEarnings;
  const total = data.reduce((s, d) => s + d.amount, 0);
  const max = Math.max(...data.map((d) => d.amount), 1);

  async function setupPayouts() {
    setConnecting(true);
    try {
      if (API_URL) {
        const res = await fetch(`${API_URL}/cleaners/stripe-connect/onboard`, {
          method: "POST",
        });
        const { url } = (await res.json()) as { url?: string };
        if (url) {
          window.location.href = url;
          return;
        }
      }
      // Dev fallback — simulate completing onboarding.
      await new Promise((r) => setTimeout(r, 700));
      setStripeConnectEnabled(true);
      toast.success("Payouts set up!");
    } catch {
      toast.error("Could not start Stripe onboarding.");
    } finally {
      setConnecting(false);
    }
  }

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
      {!stripeConnectEnabled ? (
        <Card className="flex flex-col items-start gap-3 border-seafoam-200 bg-seafoam-50 dark:border-seafoam-900/40 dark:bg-seafoam-900/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-seafoam-500 text-white">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-charcoal dark:text-white">
                Set up payouts
              </p>
              <p className="text-sm text-slate-500">
                Connect your bank with Stripe to start receiving payments.
              </p>
            </div>
          </div>
          <Button onClick={setupPayouts} loading={connecting}>
            Set up payouts with Stripe <ArrowRight className="h-4 w-4" />
          </Button>
        </Card>
      ) : (
        <Card className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-charcoal dark:text-white">
                Bank account •••• 4242
              </p>
              <p className="text-sm text-slate-500">
                Next payout: Monday · Pending {formatCurrency(420)}
              </p>
            </div>
          </div>
        </Card>
      )}

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
        <StatCard label="Lifetime earnings" value={formatCurrency(18420)} icon={Briefcase} />
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
