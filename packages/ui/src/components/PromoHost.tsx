/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useState, useCallback } from "react";
import { defaultClaimCta } from "@sweepr/utils";
import { PromoWidget, type PromoView } from "./PromoWidget";

interface PromoDisplay {
  placement?: "modal" | "banner" | "inline";
  pages?: string[];
  delaySeconds?: number;
  persist?: boolean;
  frequency?: "once" | "every_visit" | "daily";
  showOnFirstVisit?: boolean;
}
interface LivePromo extends PromoView {
  display?: PromoDisplay;
  audience?: string;
}

const SEEN_PREFIX = "sweepr.promo.seen.";

/** Whether a promo may be shown now, per its frequency + last-seen record. */
function eligibleByFrequency(slug: string, display: PromoDisplay): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(SEEN_PREFIX + slug);
  if (!raw) return true;
  const freq = display.frequency ?? "once";
  if (freq === "every_visit") return true;
  if (freq === "once") return display.persist === true ? true : false;
  // daily: show again if last-seen was on an earlier calendar day
  const last = new Date(Number(raw));
  const now = new Date();
  return last.toDateString() !== now.toDateString();
}

function markSeen(slug: string) {
  try {
    window.localStorage.setItem(SEEN_PREFIX + slug, String(Date.now()));
  } catch {
    /* private mode — ignore */
  }
}

function pathMatches(pages: string[] | undefined): boolean {
  if (!pages || pages.length === 0) return true;
  const path = window.location.pathname;
  // "/" targets the landing page EXACTLY (a catch-all prefix would make it
  // impossible to run different promos on "/" vs "/clean-with-us").
  return pages.some((p) => (p === "/" ? path === "/" : path.startsWith(p)));
}

/**
 * Site-wide promotion host. Drop one instance at app root. It fetches the live
 * promos for the given persona, picks the first eligible for the current page,
 * waits the configured delay, and shows it as a modal — honoring per-promo
 * frequency (once / daily / every visit) via localStorage. Claims are posted
 * with the caller's bearer token (via `getToken`) so Founding Member grants
 * attach to the signed-in account.
 */
export function PromoHost({
  apiBase,
  persona = "visitor",
  getToken,
  signedIn,
  signInUrl,
}: {
  apiBase: string;
  persona?: "visitor" | "customer" | "cleaner";
  getToken?: () => Promise<string | null | undefined> | string | null | undefined;
  /** Whether the viewer is authenticated. Defaults to false for persona=visitor. */
  signedIn?: boolean;
  /** Sign-in destination for promos that require an authenticated claim. */
  signInUrl?: string;
}) {
  const [promo, setPromo] = useState<LivePromo | null>(null);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/promotions/live?persona=${persona}`);
        if (!res.ok) return;
        const data = (await res.json()) as { promotions: LivePromo[] };
        const viewerSignedIn = signedIn ?? persona !== "visitor";
        const candidate = data.promotions.find(
          (p) =>
            pathMatches(p.display?.pages) &&
            eligibleByFrequency(p.slug, p.display ?? {}) &&
            // claimants="anonymous" promos are marketing-only — skip for
            // signed-in viewers ("signed_in" still shows to anonymous viewers,
            // whose CTA becomes "Sign in to claim"). Evaluated against the
            // entry page's default claim-eligible CTA (the widget itself
            // applies the same per-CTA rule to every other CTA on the page).
            !(defaultClaimCta(p.design)?.cta.claimants === "anonymous" && viewerSignedIn),
        );
        if (!candidate || cancelled) return;
        const delayMs = Math.max(0, (candidate.display?.delaySeconds ?? 0) * 1000);
        timer = setTimeout(() => {
          if (cancelled) return;
          setPromo(candidate);
          setVisible(true);
          markSeen(candidate.slug);
          fetch(`${apiBase}/promotions/${candidate.slug}/impression`, { method: "POST" }).catch(
            () => {},
          );
        }, delayMs);
      } catch {
        /* offline / blocked — silently skip */
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [apiBase, persona, signedIn]);

  const handleClaim = useCallback(
    async (fields: { email?: string; phone?: string }) => {
      if (!promo) return { ok: false };
      const token = getToken ? await getToken() : null;
      const res = await fetch(`${apiBase}/promotions/${promo.slug}/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(fields),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: res.ok, message: data.message };
    },
    [apiBase, promo, getToken],
  );

  if (!promo || !visible) return null;

  const viewerSignedIn2 = signedIn ?? persona !== "visitor";
  const placement = promo.display?.placement ?? "modal";

  // Banner: a slim strip pinned to the top; "View offer" expands the full
  // widget as a popup. Embedded ('inline') promos are placed in-page by a
  // <PromoEmbed> — the host never floats them, so skip here.
  if (placement === "inline" && !expanded) return null;
  if (placement === "banner" && !expanded) {
    const entryPage = promo.design.pages.find((p) => p.key === promo.design.entryPageKey);
    const headline =
      entryPage?.blocks?.find((b) => b.type === "heading" || b.type === "text")?.text ?? promo.name;
    return (
      <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-seafoam-700 px-4 py-2.5 text-white shadow-md">
        <p className="truncate text-sm font-medium">{headline}</p>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30"
        >
          View offer
        </button>
        <button type="button" aria-label="Dismiss" onClick={() => setVisible(false)}
          className="shrink-0 text-white/70 hover:text-white">✕</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <PromoWidget
        promo={promo}
        onClaim={handleClaim}
        onDismiss={() => { setVisible(false); setExpanded(false); }}
        signedIn={viewerSignedIn2}
        signInUrl={signInUrl}
      />
    </div>
  );
}
