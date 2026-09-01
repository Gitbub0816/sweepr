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
 * Multi-CTA list editor — add/remove/reorder as many call-to-action buttons
 * as a page needs (up to PROMO_MAX_CTAS_PER_PAGE), each with its own action,
 * style, required field, URL, success message, and — for `goto_page` — a
 * picker for which OTHER page it jumps to. The same `PromoCtaV2` shape is
 * also used inline by canvas buttons and poster hotspots (see
 * PromoCanvasEditor.tsx / PromoPageEditor.tsx's poster editor); this
 * component is the one built for a page's own `ctas[]` list, where multiple
 * buttons stack.
 */

import { Button, Input } from "@sweepr/ui";
import { PROMO_MAX_CTAS_PER_PAGE, type PromoCtaV2 } from "@sweepr/utils";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";

const CLAIM_FAMILY = new Set(["claim", "newsletter", "waitlist", "book_now"]);

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newCta(label = "New button"): PromoCtaV2 {
  return { id: uid("cta"), label, action: "dismiss", style: "primary" };
}

export function PromoCtaEditor({
  ctas,
  onChange,
  pages,
  ownPageKey,
}: {
  ctas: PromoCtaV2[];
  onChange: (ctas: PromoCtaV2[]) => void;
  /** Every page in the promotion, for the goto_page target picker. */
  pages: Array<{ key: string; name?: string }>;
  /** This CTA list's own page — offered too (a page CAN link to itself, e.g.
   *  to reset a form), just not pre-selected by default. */
  ownPageKey: string;
}) {
  function patch(i: number, p: Partial<PromoCtaV2>) {
    onChange(ctas.map((c, idx) => (idx === i ? { ...c, ...p } : c)));
  }
  function add() {
    if (ctas.length >= PROMO_MAX_CTAS_PER_PAGE) return;
    onChange([...ctas, newCta(`Button ${ctas.length + 1}`)]);
  }
  function remove(i: number) {
    onChange(ctas.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= ctas.length) return;
    const next = [...ctas];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {ctas.map((cta, i) => (
        <div key={cta.id} className="space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === ctas.length - 1}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <Input value={cta.label} onChange={(e) => patch(i, { label: e.target.value })} className="flex-1" placeholder="Button label" />
            <Button size="sm" variant="ghost" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Action
              <select value={cta.action} onChange={(e) => patch(i, { action: e.target.value as PromoCtaV2["action"] })}
                className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                <option value="claim">Claim (record + grant reward)</option>
                <option value="newsletter">Newsletter sign-up (+ reward)</option>
                <option value="waitlist">Join waitlist (+ reward)</option>
                <option value="book_now">Book now (flash offer + reward)</option>
                <option value="link">Open link</option>
                <option value="goto_page">Go to another page</option>
                <option value="dismiss">Dismiss</option>
              </select>
            </label>
            <label className="text-xs">Style
              <select value={cta.style ?? "primary"} onChange={(e) => patch(i, { style: e.target.value as PromoCtaV2["style"] })}
                className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                <option value="primary">Primary (solid)</option>
                <option value="secondary">Secondary (outline)</option>
                <option value="ghost">Ghost (subtle)</option>
                <option value="link">Link (text only)</option>
              </select>
            </label>

            {CLAIM_FAMILY.has(cta.action) ? (
              <label className="text-xs">Required field
                <select value={cta.requireField ?? "none"} onChange={(e) => patch(i, { requireField: e.target.value as PromoCtaV2["requireField"] })}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                  <option value="none">None</option><option value="email">Email</option><option value="phone">Phone</option>
                </select>
              </label>
            ) : null}
            {CLAIM_FAMILY.has(cta.action) ? (
              <label className="text-xs">Who can claim
                <select value={cta.claimants ?? "both"} onChange={(e) => patch(i, { claimants: e.target.value as PromoCtaV2["claimants"] })}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                  <option value="both">Anyone, signed in or not</option>
                  <option value="anonymous">Marketing visitors only</option>
                  <option value="signed_in">Signed-in only ("Sign in to claim")</option>
                </select>
              </label>
            ) : null}
            {cta.action === "link" || cta.action === "book_now" ? (
              <label className="col-span-2 text-xs">{cta.action === "book_now" ? "Booking URL (redirect after claim)" : "Link URL"}
                <Input value={cta.url ?? ""} onChange={(e) => patch(i, { url: e.target.value })} className="mt-1" placeholder="https://…" />
              </label>
            ) : null}
            {cta.action === "goto_page" ? (
              <label className="col-span-2 text-xs">Target page
                <select value={cta.targetPageKey ?? ""} onChange={(e) => patch(i, { targetPageKey: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                  <option value="">Choose a page…</option>
                  {pages.map((p) => (
                    <option key={p.key} value={p.key}>{p.name ?? p.key}{p.key === ownPageKey ? " (this page)" : ""}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {CLAIM_FAMILY.has(cta.action) ? (
              <label className="col-span-2 text-xs">Success message
                <Input value={cta.successMessage ?? ""} onChange={(e) => patch(i, { successMessage: e.target.value })} className="mt-1" />
              </label>
            ) : null}
          </div>
        </div>
      ))}
      <Button size="sm" variant="secondary" onClick={add} disabled={ctas.length >= PROMO_MAX_CTAS_PER_PAGE}>
        <Plus className="mr-1 h-4 w-4" />Add button{ctas.length >= PROMO_MAX_CTAS_PER_PAGE ? ` (max ${PROMO_MAX_CTAS_PER_PAGE})` : ""}
      </Button>
      {ctas.length === 0 ? (
        <p className="text-xs text-slate-400">No buttons yet. A page can also rely entirely on canvas buttons or poster hotspots instead.</p>
      ) : null}
    </div>
  );
}
