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
 * Public promotion landing page — the direct URL (getsweepr.com/promo/:slug)
 * that can be shared on social media. Renders the same designed PromoWidget the
 * on-site modal uses. Anonymous visitors can claim/capture; promos that grant
 * Founding Member status are meant to be claimed from inside the signed-in apps.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PromoWidget, type PromoView } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

export default function PromoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [promo, setPromo] = useState<PromoView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "ended">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/promotions/${slug}`);
        if (!res.ok) { if (!cancelled) setState("missing"); return; }
        const data = (await res.json()) as { promotion: PromoView | null; live: boolean };
        if (cancelled) return;
        if (!data.promotion) { setState("missing"); return; }
        setPromo(data.promotion);
        setState(data.live ? "ready" : "ended");
        if (data.live) {
          fetch(`${API}/promotions/${slug}/impression`, { method: "POST" }).catch(() => {});
        }
      } catch {
        if (!cancelled) setState("missing");
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  async function handleClaim(fields: { email?: string; phone?: string }) {
    const res = await fetch(`${API}/promotions/${slug}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: res.ok, message: data.message };
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-4 dark:from-slate-950 dark:to-slate-900">
      {state === "loading" ? (
        <div className="h-40 w-full max-w-md animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      ) : state === "missing" ? (
        <p className="text-slate-500">This promotion isn't available.</p>
      ) : state === "ended" && promo ? (
        <div className="text-center">
          <div className="pointer-events-none opacity-60">
            <PromoWidget promo={promo} />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-500">This promotion has ended.</p>
        </div>
      ) : promo ? (
        <PromoWidget promo={promo} onClaim={handleClaim} />
      ) : null}
    </div>
  );
}
