import { useState, useEffect, useCallback } from "react";
import { Wallet, TrendingUp, BarChart3, DollarSign, Building2, ArrowRight } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, StatCard, Card, Button, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface EarningSummary {
  thisWeek: number;
  thisMonth: number;
  lastMonth: number;
  allTime: number;
  pendingPayout: number;
  nextPayoutDate: string | null;
  stripeConnected: boolean;
  recent: { date: string; amount: number; status: string; booking_id: string }[];
}

export function EarningsPage() {
  const { getToken } = useAuth();
  const [data, setData] = useState<EarningSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    if (!API_URL) { setLoading(false); return; }
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/cleaner-dashboard/earnings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData((await res.json()) as EarningSummary);
    } catch {
      /* leave null → empty state */
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  async function setupPayouts() {
    setConnecting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/cleaner-dashboard/stripe-connect/onboard`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const { url } = (await res.json()) as { url?: string };
      if (url) { window.location.href = url; return; }
      toast.error("Could not start Stripe onboarding.");
    } catch {
      toast.error("Could not start Stripe onboarding.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <DashboardShell title="Earnings" description="Track your payouts and performance.">
      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : !data ? (
        <Card>
          <p className="text-sm text-slate-500">Could not load earnings right now.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {!data.stripeConnected && (
            <Card className="flex flex-col items-start gap-3 border-seafoam-200 bg-seafoam-50 dark:border-seafoam-900/40 dark:bg-seafoam-900/10 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-seafoam-500 text-white">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-charcoal dark:text-white">Set up payouts</p>
                  <p className="text-sm text-slate-500">
                    Connect your bank with Stripe to start receiving payments.
                  </p>
                </div>
              </div>
              <Button onClick={setupPayouts} loading={connecting}>
                Set up payouts with Stripe <ArrowRight className="h-4 w-4" />
              </Button>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="This Week"  value={formatCurrency(data.thisWeek / 100)}  icon={Wallet} />
            <StatCard label="This Month" value={formatCurrency(data.thisMonth / 100)} icon={TrendingUp} />
            <StatCard label="Last Month" value={formatCurrency(data.lastMonth / 100)} icon={BarChart3} />
            <StatCard label="All Time"   value={formatCurrency(data.allTime / 100)}   icon={DollarSign} />
          </div>

          {data.pendingPayout > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              <strong>{formatCurrency(data.pendingPayout / 100)}</strong> pending payout
              {data.nextPayoutDate && ` — expected ${new Date(data.nextPayoutDate).toLocaleDateString()}`}.
            </div>
          )}

          {data.recent.length > 0 ? (
            <Card className="overflow-hidden p-0">
              <div className="px-4 py-3 border-b border-slate-100 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200">
                Recent Payouts
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-50 text-xs text-slate-500 dark:border-slate-800">
                    <th className="text-left px-4 py-2">Date</th>
                    <th className="text-right px-4 py-2">Amount</th>
                    <th className="text-left px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r) => (
                    <tr key={r.booking_id} className="border-b border-slate-50 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{new Date(r.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.amount / 100)}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === "paid" || r.status === "transferred" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-slate-500">No payouts yet. Completed jobs will show up here.</p>
            </Card>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
