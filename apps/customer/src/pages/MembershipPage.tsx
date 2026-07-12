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
import { KeyRound, Check, Sparkles, ShieldCheck, Clock, Percent } from "lucide-react";
import { Card, Button, Badge, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import { useAuth } from "@clerk/clerk-react";

const API = import.meta.env.VITE_API_URL ?? "";

interface MembershipStatus {
  enabled: boolean;
  member: boolean;
  status: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  pricing: {
    monthlyCents: number;
    annualCents: number;
    discountPercent: number;
    monthlyDiscountCapCents: number;
  };
}

const BENEFITS = [
  { icon: KeyRound, text: "Sweepr Smart Entry on eligible cleanings — included" },
  { icon: Percent, text: "Member discount on eligible cleaning subtotals" },
  { icon: Clock, text: "Priority access to newly opened booking times" },
  { icon: ShieldCheck, text: "Priority matching & dedicated member support" },
  { icon: Sparkles, text: "One waived late-reschedule fee every 90 days" },
];

export function MembershipPage() {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/membership`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      setStatus((await res.json()) as MembershipStatus);
    } catch {
      toast.error("Couldn't load membership");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkout(interval: "month" | "year") {
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/membership/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ interval }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else toast.error(data.error === "already_member" ? "You're already a member" : "Couldn't start checkout");
    } catch {
      toast.error("Couldn't start checkout");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/membership/cancel`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      toast.success("Membership will end at your billing period");
      await load();
    } catch {
      toast.error("Couldn't cancel");
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/membership/resume`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      toast.success("Membership renewal resumed");
      await load();
    } catch {
      toast.error("Couldn't resume");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-3xl p-6 text-slate-500">Loading…</div>;
  if (!status?.enabled) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card className="p-6 text-center text-slate-500">Sweepr+ isn't available yet. Check back soon.</Card>
      </div>
    );
  }

  const p = status.pricing;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-seafoam-600 text-white">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-black text-charcoal dark:text-white">Sweepr+</h1>
        <p className="mt-1 text-slate-500">Smart Entry, member savings, and priority access for customers who book regularly.</p>
      </div>

      {status.member ? (
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge>Active member</Badge>
              {status.cancelAtPeriodEnd && <span className="text-xs text-amber-600">Ends {status.currentPeriodEnd?.slice(0, 10)}</span>}
            </div>
            {status.cancelAtPeriodEnd ? (
              <Button onClick={resume} disabled={busy}>Resume</Button>
            ) : (
              <Button variant="secondary" onClick={cancel} disabled={busy}>Cancel renewal</Button>
            )}
          </div>
          <ul className="mt-4 space-y-2">
            {BENEFITS.map((b) => (
              <li key={b.text} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-seafoam-600" /> {b.text}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <>
          <Card className="p-6">
            <ul className="space-y-2.5">
              {BENEFITS.map((b) => {
                const Icon = b.icon;
                return (
                  <li key={b.text} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-700 dark:bg-slate-800">
                      <Icon className="h-4 w-4" />
                    </span>
                    {b.text}
                  </li>
                );
              })}
            </ul>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="flex flex-col p-5">
              <p className="text-sm font-semibold text-slate-500">Monthly</p>
              <p className="mt-1 text-2xl font-black text-charcoal dark:text-white">
                {formatCurrency(p.monthlyCents)}<span className="text-sm font-medium text-slate-400">/mo</span>
              </p>
              <Button className="mt-4" onClick={() => checkout("month")} disabled={busy}>Join monthly</Button>
            </Card>
            <Card className="flex flex-col border-seafoam-300 p-5">
              <p className="text-sm font-semibold text-seafoam-700">Annual · best value</p>
              <p className="mt-1 text-2xl font-black text-charcoal dark:text-white">
                {formatCurrency(p.annualCents)}<span className="text-sm font-medium text-slate-400">/yr</span>
              </p>
              <p className="text-xs text-slate-500">~2 months free vs monthly</p>
              <Button className="mt-3" onClick={() => checkout("year")} disabled={busy}>Join annually</Button>
            </Card>
          </div>
          <p className="text-center text-xs text-slate-400">
            Cancel renewal anytime. See the{" "}
            <a href="https://legal.getsweepr.com/smart-entry-membership" target="_blank" rel="noreferrer" className="underline">
              Smart Entry &amp; Sweepr+ Terms
            </a>.
          </p>
        </>
      )}
    </div>
  );
}
