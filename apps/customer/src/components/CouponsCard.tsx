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
 * "Your coupons" — the only customer-facing surface coupons have. They are
 * silent by design: no widget, no code entry — the best qualifying coupon
 * applies automatically to the next booking. This card just shows what's on
 * the account (also attaches any coupon claimed by email before sign-up).
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Card } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "";

interface Coupon {
  id: string;
  code: string;
  title: string;
  theme: string | null;
  kind: "percent_off" | "amount_off" | "free_addon";
  value: number;
  addonKey: string | null;
  usesLeft: number;
  expiresAt: string;
}

const THEME_EMOJI: Record<string, string> = {
  valentines: "💝",
  christmas: "🎄",
  halloween: "🎃",
  easter: "🐣",
  thanksgiving: "🦃",
};

export function CouponsCard() {
  const { getToken } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/coupons/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setCoupons(((await res.json()) as { coupons: Coupon[] }).coupons);
    } catch {
      /* offline — skip */
    } finally {
      setLoaded(true);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  if (!loaded || coupons.length === 0) return null;

  return (
    <Card>
      <h2 className="text-sm font-semibold text-charcoal dark:text-white">Your coupons</h2>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        Applied automatically to your next qualifying booking — nothing to enter.
      </p>
      <ul className="mt-3 space-y-2">
        {coupons.map((cp) => (
          <li
            key={cp.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-seafoam-300 bg-seafoam-50/60 px-4 py-3 dark:border-seafoam-700 dark:bg-seafoam-900/20"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-charcoal dark:text-white">
                {cp.theme ? `${THEME_EMOJI[cp.theme] ?? "🎁"} ` : "🎟️ "}
                {cp.title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {cp.code} · {cp.usesLeft > 1 ? `${cp.usesLeft} uses left · ` : ""}
                expires {new Date(cp.expiresAt).toLocaleDateString()}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
