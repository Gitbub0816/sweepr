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
 * Founding Member dashboard hero + one-time welcome / badge-pick flow (cleaner).
 *
 * Founders get a visibly distinct dashboard: a gold hero with their founder
 * number, their personal badge artwork, "Founding Member since <year>", the
 * permanent earnings bonus, and the perks.
 *
 * Badge: five colorways; the founder picks ONE — once, ever. The pick is
 * irreversible (server-enforced), and the badge's letter is their first-name
 * initial, inferred server-side (never chosen). The picker runs inside the
 * one-time welcome screen; founders who somehow skipped it get a "choose your
 * badge" prompt on the hero until they pick.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useAppToken } from "@/lib/appToken";
import { Button, FoundingMemberBadge } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "";

interface FoundingStatus {
  isFoundingMember: boolean;
  founderId: number | null;
  since: string | null;
  sinceLabel: string;
  welcomeSeen: boolean;
  revoked: boolean;
  badgeColor: string | null;
  badgeUrl: string | null;
}

interface BadgeOption {
  color: string;
  previewUrl: string;
}

const COLOR_LABELS: Record<string, string> = {
  "carbon-gold": "Carbon Gold",
  "rose-gold": "Rose Gold",
  "classic-gold": "Classic Gold",
  "seafoam-gold": "Seafoam Gold",
  "minimal-gold": "Minimal Gold",
};

export function FounderBanner() {
  const { getToken } = useAppToken();
  const [status, setStatus] = useState<FoundingStatus | null>(null);
  const [bonusPct, setBonusPct] = useState(5);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [options, setOptions] = useState<BadgeOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const authedFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await getToken();
      return fetch(`${API}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
      });
    },
    [getToken],
  );

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/founding/me");
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
  }, [authedFetch]);

  useEffect(() => { void load(); }, [load]);

  const loadOptions = useCallback(async () => {
    try {
      const res = await authedFetch("/founding/badge-options");
      if (!res.ok) return;
      const data = (await res.json()) as { colors: BadgeOption[] };
      setOptions(data.colors);
    } catch {
      /* skip */
    }
  }, [authedFetch]);

  const openPicker = useCallback(async () => {
    await loadOptions();
    setShowPicker(true);
  }, [loadOptions]);

  const dismissWelcome = useCallback(async () => {
    setShowWelcome(false);
    try {
      await authedFetch("/founding/welcome-seen", {
        method: "POST",
        body: JSON.stringify({ audience: "cleaner" }),
      });
    } catch {
      /* best-effort */
    }
    // The badge pick is part of joining: go straight into the picker if the
    // founder hasn't chosen yet.
    if (!status?.badgeColor) await openPicker();
  }, [authedFetch, status?.badgeColor, openPicker]);

  const confirmBadge = useCallback(async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const res = await authedFetch("/founding/badge", {
        method: "POST",
        body: JSON.stringify({ audience: "cleaner", color: selected }),
      });
      if (res.ok) {
        setShowPicker(false);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }, [authedFetch, selected, saving, load]);

  if (!status?.isFoundingMember) return null;

  return (
    <>
      {/* Distinct founder hero */}
      <div className="relative overflow-hidden rounded-xl border border-amber-300/60 bg-gradient-to-r from-amber-100 via-yellow-50 to-amber-100 p-6 text-amber-900 dark:border-amber-500/40 dark:from-amber-500/15 dark:via-yellow-500/10 dark:to-amber-500/15 dark:text-amber-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {status.badgeUrl ? (
              <img
                src={status.badgeUrl}
                alt={`Founding Member badge #${status.founderId ?? ""}`}
                className="h-20 w-20 shrink-0 drop-shadow-md"
              />
            ) : null}
            <div>
              <FoundingMemberBadge founderId={status.founderId} size="lg" showTooltip={false} />
              <h2 className="mt-2 text-xl font-bold">Welcome back, Founding Member</h2>
              <p className="mt-0.5 text-sm opacity-80">
                Founding Member since {status.sinceLabel}
                {status.founderId ? ` · Founder #${status.founderId}` : ""}
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-white/60 px-4 py-3 text-center dark:bg-black/20">
            <p className="text-2xl font-bold">+{bonusPct}%</p>
            <p className="text-xs opacity-80">lifetime earnings bonus</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs opacity-80">
          <span>🏅 Permanent badge</span>
          <span>⚡ Early access to new features</span>
          <span>🎧 Priority support</span>
          {!status.badgeColor ? (
            <button
              type="button"
              onClick={openPicker}
              className="ml-auto rounded-full bg-amber-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-amber-700"
            >
              Choose your badge
            </button>
          ) : null}
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
              {status.founderId ? `, Founder #${status.founderId}` : ""}.
            </p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Thank you for believing in Sweepr from the beginning. Your Founding Member status and
              benefits, including a permanent {bonusPct}% earnings bonus, will remain with your
              account for life while it remains in good standing.
            </p>
            <Button className="mt-6 w-full" onClick={dismissWelcome}>
              {status.badgeColor ? "Let's go" : "Next: choose your badge"}
            </Button>
          </div>
        </div>
      ) : null}

      {/* One-time badge color pick, permanent, server-enforced */}
      {showPicker ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl dark:bg-slate-900">
            <h2 className="text-center text-2xl font-bold text-slate-900 dark:text-white">
              Choose your Founding Member badge
            </h2>
            <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
              Your badge carries your founder number and your initial. Pick one of five colors.
            </p>
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              You can only pick once, your badge can never be changed.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {options.map((o) => (
                <button
                  key={o.color}
                  type="button"
                  onClick={() => setSelected(o.color)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition ${
                    selected === o.color
                      ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20"
                      : "border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                  }`}
                >
                  <img src={o.previewUrl} alt={COLOR_LABELS[o.color] ?? o.color} className="h-14 w-14" />
                  <span className="text-center text-[10px] font-medium leading-tight text-slate-600 dark:text-slate-300">
                    {COLOR_LABELS[o.color] ?? o.color}
                  </span>
                </button>
              ))}
            </div>
            <Button className="mt-6 w-full" onClick={confirmBadge} disabled={!selected || saving}>
              {saving ? "Locking it in…" : selected ? `Lock in ${COLOR_LABELS[selected] ?? selected}, forever` : "Select a color"}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
