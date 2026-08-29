/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useState, useEffect, useCallback } from "react";
import { Wallet, TrendingUp, BarChart3, DollarSign, Building2, ArrowRight, Gift, Users } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { useAppToken } from "@/lib/appToken";
import { useTranslation } from "react-i18next";
import { DashboardShell, StatCard, Card, Button, Badge, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import { fetchCrewRoster, crewSize } from "../lib/crew";

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
  tipsThisMonth?: number;
  tipsAllTime?: number;
  recentTips?: { booking_id: string; amount_cents: number; date: string }[];
}

export function EarningsPage() {
  const { t } = useTranslation();
  const { getToken } = useAppToken();
  const [data, setData] = useState<EarningSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  // Per-booking crew info for the recent payouts: bookingId → crew size. Absent
  // means solo (or not yet loaded) and the row renders exactly as before.
  const [crewByBooking, setCrewByBooking] = useState<Record<string, number>>({});

  const authFetch = useCallback(
    async (path: string, opts: RequestInit = {}) => {
      const token = await getToken();
      return fetch(`${API_URL}${path}`, {
        ...opts,
        headers: { ...(opts.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
    },
    [getToken],
  );

  const load = useCallback(async () => {
    if (!API_URL) { setLoading(false); return; }
    try {
      const res = await authFetch(`/cleaner-dashboard/earnings`);
      if (res.ok) {
        const summary = (await res.json()) as EarningSummary;
        setData(summary);
        // Tag which recent payouts were team cleans (per-seat earnings).
        const ids = Array.from(new Set((summary.recent ?? []).map((r) => r.booking_id).filter(Boolean)));
        const pairs = await Promise.all(
          ids.map(async (bid): Promise<[string, number] | null> => {
            const roster = await fetchCrewRoster(authFetch, bid);
            return roster ? [bid, crewSize(roster)] : null;
          }),
        );
        const map: Record<string, number> = {};
        for (const p of pairs) if (p) map[p[0]] = p[1];
        setCrewByBooking(map);
      }
    } catch {
      /* leave null → empty state */
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  async function setupPayouts() {
    setConnecting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/cleaner-dashboard/stripe-connect/onboard`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as { url?: string; message?: string };
      if (body.url) { window.location.href = body.url; return; }
      toast.error(body.message || "Could not start Stripe onboarding.");
    } catch {
      toast.error("Could not start Stripe onboarding.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <DashboardShell title={t("cleaner.earnings.title")} description={t("cleaner.earnings.description")}>
      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : !data ? (
        <Card>
          <p className="text-sm text-slate-500">{t("errors.couldNotLoad")}</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {!data.stripeConnected && (
            <Card className="flex flex-col items-start gap-3 border-seafoam-200 bg-seafoam-50 dark:border-seafoam-900/40 dark:bg-seafoam-900/10 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-seafoam-700 text-white">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-charcoal dark:text-white">{t("cleaner.earnings.setupPayouts")}</p>
                  <p className="text-sm text-slate-500">
                    {t("cleaner.earnings.connectBank")}
                  </p>
                </div>
              </div>
              <Button onClick={setupPayouts} loading={connecting}>
                {t("cleaner.earnings.setupPayouts")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t("cleaner.earnings.thisWeek")}  value={formatCurrency(data.thisWeek / 100)}  icon={Wallet} />
            <StatCard label={t("cleaner.earnings.thisMonth")} value={formatCurrency(data.thisMonth / 100)} icon={TrendingUp} />
            <StatCard label={t("cleaner.earnings.lastMonth")} value={formatCurrency(data.lastMonth / 100)} icon={BarChart3} />
            <StatCard label={t("cleaner.earnings.allTime")}   value={formatCurrency(data.allTime / 100)}   icon={DollarSign} />
          </div>

          {(!!data.tipsThisMonth || !!data.tipsAllTime) && (
            <Card className="space-y-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-charcoal dark:text-white">
                <Gift className="h-4 w-4 text-seafoam-700" /> {t("cleaner.earnings.tips")}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard label={t("cleaner.earnings.tipsThisMonth")} value={formatCurrency((data.tipsThisMonth ?? 0) / 100)} icon={Gift} />
                <StatCard label={t("cleaner.earnings.tipsAllTime")} value={formatCurrency((data.tipsAllTime ?? 0) / 100)} icon={Gift} />
              </div>
              {data.recentTips && data.recentTips.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-500">{t("cleaner.earnings.recentTips")}</p>
                  {data.recentTips.slice(0, 5).map((tip) => (
                    <div key={`${tip.booking_id}-${tip.date}`} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">{new Date(tip.date).toLocaleDateString()}</span>
                      <span className="font-medium text-charcoal dark:text-white">{formatCurrency(tip.amount_cents / 100)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {data.pendingPayout > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              <strong>{formatCurrency(data.pendingPayout / 100)}</strong> {t("cleaner.earnings.pendingPayout")}
              {data.nextPayoutDate && `, ${t("cleaner.earnings.expected")} ${new Date(data.nextPayoutDate).toLocaleDateString()}`}.
            </div>
          )}

          {data.recent.length > 0 ? (
            <Card className="overflow-hidden p-0">
              <div className="px-4 py-3 border-b border-slate-100 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200">
                {t("cleaner.earnings.recentPayouts")}
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
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                        <span className="block">{new Date(r.date).toLocaleDateString()}</span>
                        {crewByBooking[r.booking_id] != null && (
                          <Badge variant="info" className="mt-1 gap-1">
                            <Users className="h-3 w-3" aria-hidden />
                            {t("cleaner.team.crewOf", { count: crewByBooking[r.booking_id] })}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {formatCurrency(r.amount / 100)}
                        {crewByBooking[r.booking_id] != null && (
                          <span className="block text-[10px] font-normal text-slate-500">{t("cleaner.team.yourShare")}</span>
                        )}
                      </td>
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
              <p className="text-sm text-slate-500">{t("cleaner.earnings.noPayoutsYet")}</p>
            </Card>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
