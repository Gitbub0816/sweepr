/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Founding Member recognition banner + one-time welcome screen for customers.
 * Customer founders get recognition perks (badge, early access, priority
 * support) — no earnings bonus. Shows a distinct gold banner + a one-time
 * congratulations modal (dismissed via the server-side welcome-seen flag).
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Button, FoundingMemberBadge } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "";

interface FoundingStatus {
  isFoundingMember: boolean;
  founderId: number | null;
  since: string | null;
  sinceLabel: string;
  welcomeSeen: boolean;
  revoked: boolean;
}

export function FounderBanner() {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<FoundingStatus | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/founding/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = (await res.json()) as { customer: FoundingStatus | null };
      if (data.customer?.isFoundingMember) {
        setStatus(data.customer);
        if (!data.customer.welcomeSeen) setShowWelcome(true);
      }
    } catch {
      /* offline — skip */
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  const dismissWelcome = useCallback(async () => {
    setShowWelcome(false);
    try {
      const token = await getToken();
      await fetch(`${API}/founding/welcome-seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ audience: "customer" }),
      });
    } catch {
      /* best-effort */
    }
  }, [getToken]);

  if (!status?.isFoundingMember) return null;

  return (
    <>
      <div className="rounded-xl border border-amber-300/60 bg-gradient-to-r from-amber-100 via-yellow-50 to-amber-100 p-5 text-amber-900 dark:border-amber-500/40 dark:from-amber-500/15 dark:via-yellow-500/10 dark:to-amber-500/15 dark:text-amber-200">
        <div className="flex flex-wrap items-center gap-3">
          <FoundingMemberBadge founderId={status.founderId} size="lg" showTooltip={false} />
          <div>
            <p className="font-semibold">Thanks for being here from the start.</p>
            <p className="text-sm opacity-80">
              Founding Member since {status.sinceLabel}
              {status.founderId ? ` · Founder #${status.founderId}` : ""} — early access &amp; priority support.
            </p>
          </div>
        </div>
      </div>

      {showWelcome ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl dark:bg-slate-900">
            <div className="text-5xl">🏅</div>
            <h2 className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">Congratulations!</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              You are officially one of Sweepr's Founding Members
              {status.founderId ? ` — Founder #${status.founderId}` : ""}.
            </p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Thank you for believing in Sweepr from the beginning. Your Founding Member status and
              benefits will remain with your account for life while it remains in good standing.
            </p>
            <Button className="mt-6 w-full" onClick={dismissWelcome}>Let's go</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
