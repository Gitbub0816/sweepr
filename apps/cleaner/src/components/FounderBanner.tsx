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
 * Founding Member dashboard hero + one-time welcome screen for cleaners.
 *
 * Founders get a visibly distinct dashboard: a gold hero with their founder
 * number, "Founding Member since <year>", the permanent earnings bonus, and the
 * perks. The first time a founder loads the dashboard, a one-time congratulations
 * modal appears and is then dismissed permanently (server-side welcome-seen flag).
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
  const [bonusPct, setBonusPct] = useState(5);
  const [showWelcome, setShowWelcome] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/founding/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = (await res.json()) as { cleaner: FoundingStatus | null; bonusPct: number };
      setBonusPct(data.bonusPct ?? 5);
      if (data.cleaner?.isFoundingMember) {
        setStatus(data.cleaner);
        if (!data.cleaner.welcomeSeen) setShowWelcome(true);
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
        body: JSON.stringify({ audience: "cleaner" }),
      });
    } catch {
      /* best-effort */
    }
  }, [getToken]);

  if (!status?.isFoundingMember) return null;

  return (
    <>
      {/* Distinct founder hero */}
      <div className="relative overflow-hidden rounded-xl border border-amber-300/60 bg-gradient-to-r from-amber-100 via-yellow-50 to-amber-100 p-6 text-amber-900 dark:border-amber-500/40 dark:from-amber-500/15 dark:via-yellow-500/10 dark:to-amber-500/15 dark:text-amber-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FoundingMemberBadge founderId={status.founderId} size="lg" showTooltip={false} />
            </div>
            <h2 className="mt-2 text-xl font-bold">Welcome back, Founding Member</h2>
            <p className="mt-0.5 text-sm opacity-80">
              Founding Member since {status.sinceLabel}
              {status.founderId ? ` · Founder #${status.founderId}` : ""}
            </p>
          </div>
          <div className="rounded-lg bg-white/60 px-4 py-3 text-center dark:bg-black/20">
            <p className="text-2xl font-bold">+{bonusPct}%</p>
            <p className="text-xs opacity-80">lifetime earnings bonus</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-80">
          <span>🏅 Permanent badge</span>
          <span>⚡ Early access to new features</span>
          <span>🎧 Priority support</span>
        </div>
      </div>

      {/* One-time congratulations */}
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
              benefits — including a permanent {bonusPct}% earnings bonus — will remain with your
              account for life while it remains in good standing.
            </p>
            <Button className="mt-6 w-full" onClick={dismissWelcome}>Let's go</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
