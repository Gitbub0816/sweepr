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
 * Admin Promotions — a full multi-page, multi-CTA designer for promotion
 * widgets.
 *
 * Left: promotion list + "new from template". Right, once a promotion is
 * selected: header (status/actions/public URL/stats), a page list (add,
 * duplicate, rename, reorder, delete, set entry page — up to
 * PROMO_MAX_PAGES), the selected page's full editor (PromoPageEditor: mode
 * switcher, content, buttons), display rules, expiry, the reward this
 * promotion grants, and claim stats — with a live PromoWidget preview that
 * renders EXACTLY what a customer sees, including multi-page `goto_page`
 * navigation. Founding Member templates are seeded automatically by the API.
 *
 * Every promotion here is authored/saved in the PromoDesignV2 shape
 * (packages/utils/src/promoSchema.ts); a promotion created before this
 * designer existed is upgraded to that shape the moment it's opened (the
 * API normalizes on GET) and stays upgraded once saved.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, Button, Input, toast, PromoWidget, type PromoView } from "@sweepr/ui";
import {
  PROMO_MAX_PAGES,
  type PromoDesignV2,
  type PromoPageV2,
} from "@sweepr/utils";
import { PromoPageEditor } from "./PromoPageEditor";
import { DollarInput } from "../../components/DollarInput";
import { CouponsPage } from "../CouponsPage";
import { Megaphone, Plus, Copy, Trash2, Play, Pause, Archive, FileStack, Star } from "lucide-react";
import { useAuthedFetch } from "../../lib/alerts";

type Audience = "all" | "visitors" | "customers" | "cleaners";
type Status = "draft" | "active" | "paused" | "expired" | "archived";

interface RewardCoupon {
  kind: "percent_off" | "amount_off" | "free_addon";
  value?: number;
  addonKey?: string;
  title?: string;
  validDays?: number;
  offerMinutes?: number;
  maxRedemptions?: number;
  minBookingTotalCents?: number;
  stackable?: boolean;
  maxStack?: number;
}
interface Promo {
  id: string;
  slug: string;
  name: string;
  template_key: string | null;
  audience: Audience;
  status: Status;
  design: PromoDesignV2;
  reward?: { coupon?: RewardCoupon };
  display: { placement?: string; pages?: string[]; delaySeconds?: number; persist?: boolean; frequency?: "once" | "every_visit" | "daily"; showOnFirstVisit?: boolean };
  starts_at: string | null;
  expires_at: string | null;
  max_claims: number | null;
  claim_count: number;
  view_count: number;
  grants_founding_member: boolean;
  design_version: number;
  created_via: "console" | "mcp";
}
interface Template {
  templateKey: string;
  name: string;
  audience: Audience;
  grantsFoundingMember: boolean;
}

const MARKETING_ORIGIN =
  (import.meta.env.VITE_MARKETING_URL as string | undefined) ?? "https://getsweepr.com";

const STATUS_TONE: Record<Status, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  expired: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
  archived: "bg-slate-100 text-slate-400 line-through dark:bg-slate-800",
};

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniquePageKey(existing: string[], base = "page"): string {
  let n = existing.length + 1;
  let key = `${base}-${n}`;
  while (existing.includes(key)) {
    n += 1;
    key = `${base}-${n}`;
  }
  return key;
}

function blankPage(key: string, name: string): PromoPageV2 {
  return {
    key,
    name,
    mode: "blocks",
    blocks: [{ type: "heading", text: name, align: "center" }],
    ctas: [{ id: uid("cta"), label: "Continue", action: "dismiss", style: "primary" }],
  };
}

/** After removing a page, any `goto_page` CTA that pointed at it (page-level,
 *  canvas button, or poster hotspot) would fail schema validation on save —
 *  clear those dangling targets immediately rather than surfacing it as a
 *  save-time error the admin has to hunt for. */
function clearDanglingTargets(design: PromoDesignV2, removedKey: string): PromoDesignV2 {
  const fix = (cta: PromoDesignV2["pages"][number]["ctas"][number]) =>
    cta.action === "goto_page" && cta.targetPageKey === removedKey
      ? { ...cta, targetPageKey: undefined }
      : cta;
  return {
    ...design,
    pages: design.pages.map((p) => ({
      ...p,
      ctas: p.ctas.map(fix),
      canvas: p.canvas
        ? { ...p.canvas, elements: p.canvas.elements.map((el) => (el.cta ? { ...el, cta: fix(el.cta) } : el)) }
        : p.canvas,
      poster: p.poster
        ? { ...p.poster, hotspots: (p.poster.hotspots ?? []).map((h) => ({ ...h, cta: fix(h.cta) })) }
        : p.poster,
    })),
  };
}

export function PromotionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "coupons" ? "coupons" : "promotions";
  const setTab = (next: "promotions" | "coupons") => {
    const params = new URLSearchParams(searchParams);
    if (next === "promotions") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Megaphone className="h-6 w-6 text-seafoam-600" />
        <div>
          <h1 className="text-2xl font-bold">Promotions</h1>
          <p className="text-sm text-slate-500">Design multi-page promo widgets, publish shareable URLs, and manage the coupons they grant.</p>
        </div>
      </header>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {([["promotions", "Promotions"], ["coupons", "Coupons"]] as ["promotions" | "coupons", string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? "border-seafoam-600 text-seafoam-700 dark:text-seafoam-400"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "coupons" ? <CouponsPage embedded /> : <PromotionsDesigner />}
    </div>
  );
}

function PromotionsDesigner() {
  const authed = useAuthedFetch();
  const [list, setList] = useState<Promo[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Promo | null>(null);
  const [activePageKey, setActivePageKey] = useState<string>("");
  const [stats, setStats] = useState<{ claims: number; founders: number }>({ claims: 0, founders: 0 });
  const [claims, setClaims] = useState<Array<{ id: string; email: string | null; phone: string | null; granted_founding: boolean; claimed_at: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const [pr, tr] = await Promise.all([authed("/admin/promotions"), authed("/admin/promotions/templates")]);
    if (pr.ok) setList(((await pr.json()) as { promotions: Promo[] }).promotions);
    if (tr.ok) setTemplates(((await tr.json()) as { templates: Template[] }).templates);
  }, [authed]);

  useEffect(() => { void load(); }, [load]);

  const selectPromo = useCallback(async (id: string) => {
    setSelectedId(id);
    const res = await authed(`/admin/promotions/${id}`);
    if (res.ok) {
      const data = (await res.json()) as { promotion: Promo; stats: { claims: number; founders: number } };
      setDraft(data.promotion);
      setActivePageKey(data.promotion.design.entryPageKey);
      setStats(data.stats);
    }
    const cr = await authed(`/admin/promotions/${id}/claims`);
    if (cr.ok) {
      setClaims(((await cr.json()) as { claims: typeof claims }).claims);
    }
  }, [authed]);

  async function createPromo(templateKey?: string) {
    const name = window.prompt(
      templateKey ? "Name this promotion" : "New promotion name",
      templateKey ? templates.find((t) => t.templateKey === templateKey)?.name ?? "" : "Untitled promotion",
    );
    if (!name) return;
    setCreating(true);
    try {
      const res = await authed("/admin/promotions", {
        method: "POST",
        body: JSON.stringify({ name, templateKey }),
      });
      if (!res.ok) { toast.error("Could not create promotion"); return; }
      const { promotion } = (await res.json()) as { promotion: Promo };
      await load();
      await selectPromo(promotion.id);
      toast.success("Promotion created");
    } finally { setCreating(false); }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await authed(`/admin/promotions/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: draft.name,
          audience: draft.audience,
          design: draft.design,
          display: draft.display,
          reward: draft.reward ?? {},
          startsAt: draft.starts_at,
          expiresAt: draft.expires_at,
          maxClaims: draft.max_claims,
          grantsFoundingMember: draft.grants_founding_member,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { issues?: Array<{ message: string }> } };
        const detail = body?.error?.issues?.map((i) => i.message).join(" ") ?? "";
        toast.error(detail ? `Save failed: ${detail}` : "Save failed");
        return;
      }
      toast.success("Saved");
      await load();
    } finally { setSaving(false); }
  }

  async function setStatus(status: Status) {
    if (!draft) return;
    const res = await authed(`/admin/promotions/${draft.id}/status`, {
      method: "POST", body: JSON.stringify({ status }),
    });
    if (res.ok) { setDraft({ ...draft, status }); await load(); toast.success(`Promotion ${status}`); }
  }

  async function remove() {
    if (!draft || !window.confirm("Delete this promotion? Template-based ones are archived instead.")) return;
    const res = await authed(`/admin/promotions/${draft.id}`, { method: "DELETE" });
    if (res.ok) { setDraft(null); setSelectedId(null); await load(); toast.success("Removed"); }
  }

  const publicUrl = draft ? `${MARKETING_ORIGIN}/promo/${draft.slug}` : "";
  const pageRefs = useMemo(
    () => (draft ? draft.design.pages.map((p) => ({ key: p.key, name: p.name })) : []),
    [draft],
  );
  const activePage = draft?.design.pages.find((p) => p.key === activePageKey) ?? draft?.design.pages[0];

  const previewPromo: PromoView | null = useMemo(
    () => draft ? {
      id: draft.id, slug: draft.slug, name: draft.name,
      audience: draft.audience,
      // Preview starts on whichever page is being edited, not necessarily
      // the promotion's real entry page, so every page can be spot-checked —
      // goto_page navigation between pages still works from there.
      design: { ...draft.design, entryPageKey: activePageKey || draft.design.entryPageKey },
      grantsFoundingMember: draft.grants_founding_member,
      reward: draft.reward,
    } : null,
    [draft, activePageKey],
  );

  function updateDesign(next: PromoDesignV2) {
    if (!draft) return;
    setDraft({ ...draft, design: next });
  }
  function updatePage(next: PromoPageV2) {
    if (!draft) return;
    updateDesign({ ...draft.design, pages: draft.design.pages.map((p) => (p.key === next.key ? next : p)) });
  }

  function addPage() {
    if (!draft || draft.design.pages.length >= PROMO_MAX_PAGES) return;
    const key = uniquePageKey(draft.design.pages.map((p) => p.key));
    const page = blankPage(key, `Page ${draft.design.pages.length + 1}`);
    updateDesign({ ...draft.design, pages: [...draft.design.pages, page] });
    setActivePageKey(key);
  }
  function duplicatePage(key: string) {
    if (!draft) return;
    const src = draft.design.pages.find((p) => p.key === key);
    if (!src || draft.design.pages.length >= PROMO_MAX_PAGES) return;
    const newKey = uniquePageKey(draft.design.pages.map((p) => p.key));
    const regen = (cta: PromoPageV2["ctas"][number]) => ({ ...cta, id: uid("cta") });
    const copy: PromoPageV2 = {
      ...src,
      key: newKey,
      name: `${src.name ?? src.key} copy`,
      ctas: src.ctas.map(regen),
      canvas: src.canvas
        ? { ...src.canvas, elements: src.canvas.elements.map((el) => ({ ...el, id: uid("el"), cta: el.cta ? regen(el.cta) : undefined })) }
        : src.canvas,
      poster: src.poster
        ? { ...src.poster, hotspots: (src.poster.hotspots ?? []).map((h) => ({ ...h, cta: regen(h.cta) })) }
        : src.poster,
    };
    updateDesign({ ...draft.design, pages: [...draft.design.pages, copy] });
    setActivePageKey(newKey);
  }
  function removePage(key: string) {
    if (!draft || draft.design.pages.length <= 1) { toast.error("A promotion needs at least one page."); return; }
    if (!window.confirm("Remove this page? Any button that jumps to it will be cleared.")) return;
    const cleaned = clearDanglingTargets(draft.design, key);
    const pages = cleaned.pages.filter((p) => p.key !== key);
    const entryPageKey = cleaned.entryPageKey === key ? pages[0].key : cleaned.entryPageKey;
    updateDesign({ ...cleaned, pages, entryPageKey });
    if (activePageKey === key) setActivePageKey(pages[0].key);
  }
  function renamePage(key: string, name: string) {
    if (!draft) return;
    updateDesign({ ...draft.design, pages: draft.design.pages.map((p) => (p.key === key ? { ...p, name } : p)) });
  }
  function movePage(key: string, dir: -1 | 1) {
    if (!draft) return;
    const pages = [...draft.design.pages];
    const i = pages.findIndex((p) => p.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= pages.length) return;
    [pages[i], pages[j]] = [pages[j], pages[i]];
    updateDesign({ ...draft.design, pages });
  }
  function setEntryPage(key: string) {
    if (!draft) return;
    updateDesign({ ...draft.design, entryPageKey: key });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* ── List + create ── */}
        <div className="space-y-3">
          <Card className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">New from template</span>
            </div>
            <div className="space-y-1.5">
              {templates.map((t) => (
                <button key={t.templateKey} disabled={creating}
                  onClick={() => createPromo(t.templateKey)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-seafoam-400 dark:border-slate-700">
                  <span>{t.name}</span>
                  {t.grantsFoundingMember ? <span aria-hidden>🏅</span> : null}
                </button>
              ))}
              <Button variant="secondary" className="w-full" onClick={() => createPromo()} disabled={creating}>
                <Plus className="mr-1 h-4 w-4" /> Blank promotion
              </Button>
            </div>
          </Card>

          <Card className="p-3">
            <span className="mb-2 block text-sm font-semibold">All promotions</span>
            <div className="space-y-1.5">
              {list.map((p) => (
                <button key={p.id} onClick={() => selectPromo(p.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selectedId === p.id ? "bg-seafoam-50 dark:bg-seafoam-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                  <span className="flex items-center gap-1.5 truncate">
                    {p.created_via === "mcp" ? <span title="Published via the promotions MCP tool" aria-hidden>🤖</span> : null}
                    {p.name}
                  </span>
                  <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_TONE[p.status]}`}>{p.status}</span>
                </button>
              ))}
              {list.length === 0 ? <p className="px-1 py-2 text-xs text-slate-400">No promotions yet.</p> : null}
            </div>
          </Card>
        </div>

        {/* ── Designer ── */}
        {draft && previewPromo && activePage ? (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="flex-1" />
                  <span className={`rounded-full px-2 py-1 text-xs ${STATUS_TONE[draft.status]}`}>{draft.status}</span>
                  {draft.created_via === "mcp" ? (
                    <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                      Published via MCP
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {draft.status !== "active" ? <Button size="sm" onClick={() => setStatus("active")}><Play className="mr-1 h-4 w-4" />Activate</Button> : null}
                  {draft.status === "active" ? <Button size="sm" variant="secondary" onClick={() => setStatus("paused")}><Pause className="mr-1 h-4 w-4" />Pause</Button> : null}
                  <Button size="sm" variant="secondary" onClick={() => setStatus("archived")}><Archive className="mr-1 h-4 w-4" />Archive</Button>
                  <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                  <code className="flex-1 truncate">{publicUrl}</code>
                  <button onClick={() => { void navigator.clipboard.writeText(publicUrl); toast.success("URL copied"); }}
                    className="text-slate-500 hover:text-seafoam-600"><Copy className="h-4 w-4" /></button>
                </div>
                <p className="text-xs text-slate-500">Views: {draft.view_count} · Claims: {stats.claims}{draft.grants_founding_member ? ` · Founders granted: ${stats.founders}` : ""}</p>
              </Card>

              {/* Pages */}
              <Card className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Pages ({draft.design.pages.length}/{PROMO_MAX_PAGES})</h3>
                  <Button size="sm" variant="secondary" onClick={addPage} disabled={draft.design.pages.length >= PROMO_MAX_PAGES}>
                    <Plus className="mr-1 h-4 w-4" />Add page
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {draft.design.pages.map((p, i) => (
                    <div key={p.key}
                      className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                        p.key === activePageKey ? "border-seafoam-500 bg-seafoam-50 dark:bg-seafoam-900/20" : "border-slate-200 dark:border-slate-700"
                      }`}>
                      <button onClick={() => setActivePageKey(p.key)} className="max-w-[140px] truncate font-medium">
                        {p.name ?? p.key}
                      </button>
                      <button title={p.key === draft.design.entryPageKey ? "Entry page" : "Set as entry page"}
                        onClick={() => setEntryPage(p.key)}
                        className={p.key === draft.design.entryPageKey ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}>
                        <Star className="h-3.5 w-3.5" fill={p.key === draft.design.entryPageKey ? "currentColor" : "none"} />
                      </button>
                      <button title="Move left" disabled={i === 0} onClick={() => movePage(p.key, -1)} className="px-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30">‹</button>
                      <button title="Move right" disabled={i === draft.design.pages.length - 1} onClick={() => movePage(p.key, 1)} className="px-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30">›</button>
                      <button title="Duplicate" onClick={() => duplicatePage(p.key)} className="text-slate-400 hover:text-slate-700"><FileStack className="h-3.5 w-3.5" /></button>
                      <button title="Delete" onClick={() => removePage(p.key)} className="text-red-400 hover:text-red-600">✕</button>
                    </div>
                  ))}
                </div>
                <label className="block text-xs">Page name
                  <Input value={activePage.name ?? ""} onChange={(e) => renamePage(activePage.key, e.target.value)} className="mt-1" placeholder={activePage.key} />
                </label>
                <p className="text-xs text-slate-500">
                  The star marks the entry page (shown first). A "Go to another page" button anywhere
                  in the design jumps to any page by name, so a promo can offer an alternate
                  design, a details page, or a multi-step flow.
                </p>
              </Card>

              <PromoPageEditor page={activePage} pages={pageRefs} onChange={updatePage} promoId={draft.id} authed={authed} />

              {/* Reward, the coupon this promo grants (coupons are silent: they
                  sit on the account and apply automatically at payout) */}
              <Card className="space-y-3 p-4">
                <h3 className="font-semibold">Reward (coupon)</h3>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={Boolean(draft.reward?.coupon)}
                    onChange={(e) => setDraft({ ...draft, reward: e.target.checked ? { coupon: { kind: "percent_off", value: 15, validDays: 180, maxRedemptions: 1 } } : {} })} />
                  Claiming grants a coupon
                </label>
                {draft.reward?.coupon ? (() => {
                  const rc = draft.reward!.coupon!;
                  const patch = (pp: Partial<RewardCoupon>) => setDraft({ ...draft, reward: { coupon: { ...rc, ...pp } } });
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs">Type
                        <select value={rc.kind} onChange={(e) => patch({ kind: e.target.value as RewardCoupon["kind"] })}
                          className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                          <option value="percent_off">% off next booking</option>
                          <option value="amount_off">$ off next booking</option>
                          <option value="free_addon">Free add-on</option>
                        </select>
                      </label>
                      {rc.kind === "free_addon" ? (
                        <label className="text-xs">Add-on key
                          <Input value={rc.addonKey ?? ""} placeholder="inside_fridge" onChange={(e) => patch({ addonKey: e.target.value })} className="mt-1" />
                        </label>
                      ) : rc.kind === "amount_off" ? (
                        <label className="text-xs">Amount off
                          <DollarInput cents={rc.value ?? 0} onCents={(c) => patch({ value: c ?? 0 })} className="mt-1" ariaLabel="Amount off" />
                        </label>
                      ) : (
                        <label className="text-xs">Percent (1–100)
                          <Input type="number" min={1} value={rc.value ?? 0} onChange={(e) => patch({ value: Number(e.target.value) })} className="mt-1" />
                        </label>
                      )}
                      <label className="text-xs">Coupon title (shown on the account)
                        <Input value={rc.title ?? ""} placeholder="15% off your next booking" onChange={(e) => patch({ title: e.target.value })} className="mt-1" />
                      </label>
                      <label className="text-xs">Uses per person
                        <Input type="number" min={1} value={rc.maxRedemptions ?? 1} onChange={(e) => patch({ maxRedemptions: Number(e.target.value) })} className="mt-1" />
                      </label>
                      <label className="text-xs">Valid days (max 180, legal cap)
                        <Input type="number" min={1} max={180} value={rc.validDays ?? 180} onChange={(e) => patch({ validDays: Math.min(Number(e.target.value), 180) })} className="mt-1" />
                      </label>
                      <label className="text-xs">Flash offer window (minutes, optional)
                        <Input type="number" min={0} value={rc.offerMinutes ?? ""} placeholder="15 = expires 15 min after claiming"
                          onChange={(e) => patch({ offerMinutes: e.target.value ? Number(e.target.value) : undefined })} className="mt-1" />
                      </label>
                      <label className="text-xs">Min booking total (optional)
                        <DollarInput cents={rc.minBookingTotalCents ?? null} allowEmpty onCents={(c) => patch({ minBookingTotalCents: c ?? undefined })} className="mt-1" ariaLabel="Minimum booking total" />
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={rc.stackable ?? false} onChange={(e) => patch({ stackable: e.target.checked })} />
                        Stackable (may combine with other stackable coupons)
                      </label>
                      {rc.stackable ? (
                        <label className="text-xs">Max coupons in a stack (blank = no cap)
                          <Input type="number" min={2} max={20} value={rc.maxStack ?? ""}
                            onChange={(e) => patch({ maxStack: e.target.value ? Number(e.target.value) : undefined })} className="mt-1" />
                        </label>
                      ) : null}
                      <p className="col-span-2 text-xs text-slate-500">
                        Each person can claim this promo's coupon ONCE, enforced per account and per
                        email at the database. Coupons are silent, no widget. They appear in the person's account and apply
                        automatically to the next qualifying booking. Anonymous claims capture an email;
                        the coupon activates when that person signs up (required to claim, per the
                        Promotions &amp; Coupons Terms).
                      </p>
                    </div>
                  );
                })() : null}
              </Card>

              {/* Display + expiry */}
              <Card className="space-y-3 p-4">
                <h3 className="font-semibold">Display &amp; expiry</h3>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">Audience
                    <select value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value as Audience })}
                      className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                      <option value="all">Everyone</option><option value="visitors">Visitors</option><option value="customers">Customers</option><option value="cleaners">Cleaners</option>
                    </select>
                  </label>
                  <label className="text-xs">Placement
                    <select value={draft.display.placement ?? "modal"} onChange={(e) => setDraft({ ...draft, display: { ...draft.display, placement: e.target.value } })}
                      className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                      <option value="modal">Popup, overlays the page after the delay</option>
                      <option value="banner">Banner, slim top strip; “View offer” expands the popup</option>
                      <option value="inline">Embedded, in-page / direct /promo link only</option>
                    </select>
                  </label>
                  <label className="text-xs">Show after (seconds)
                    <Input type="number" min={0} value={draft.display.delaySeconds ?? 0}
                      onChange={(e) => setDraft({ ...draft, display: { ...draft.display, delaySeconds: Number(e.target.value) } })} className="mt-1" />
                  </label>
                  <label className="text-xs">Frequency
                    <select value={draft.display.frequency ?? "once"} onChange={(e) => setDraft({ ...draft, display: { ...draft.display, frequency: e.target.value as "once" | "every_visit" | "daily" } })}
                      className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                      <option value="once">Once</option><option value="daily">Once per day</option><option value="every_visit">Every visit</option>
                    </select>
                  </label>
                  <label className="col-span-2 flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={draft.display.persist ?? false}
                      onChange={(e) => setDraft({ ...draft, display: { ...draft.display, persist: e.target.checked } })} />
                    Persist (show again on later visits per frequency)
                  </label>
                  <label className="col-span-2 text-xs">Pages (path prefixes, comma-separated; blank = all)
                    <Input value={(draft.display.pages ?? []).join(", ")}
                      onChange={(e) => setDraft({ ...draft, display: { ...draft.display, pages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })} className="mt-1" />
                  </label>
                  <label className="text-xs">Starts at
                    <Input type="datetime-local" value={toLocal(draft.starts_at)} onChange={(e) => setDraft({ ...draft, starts_at: fromLocal(e.target.value) })} className="mt-1" />
                  </label>
                  <label className="text-xs">Expires at
                    <Input type="datetime-local" value={toLocal(draft.expires_at)} onChange={(e) => setDraft({ ...draft, expires_at: fromLocal(e.target.value) })} className="mt-1" />
                  </label>
                  <label className="text-xs">Max claims (blank = unlimited)
                    <Input type="number" min={1} value={draft.max_claims ?? ""} onChange={(e) => setDraft({ ...draft, max_claims: e.target.value ? Number(e.target.value) : null })} className="mt-1" />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.grants_founding_member}
                    onChange={(e) => setDraft({ ...draft, grants_founding_member: e.target.checked })} />
                  Claiming grants Founding Member status
                </label>
                {draft.grants_founding_member ? (
                  <p className="text-xs text-slate-500">
                    Signed-out claims capture an email; status attaches automatically when that person
                    signs up with the same email. One founding status per person, a cleaner-founder
                    can never also claim customer-founder (and vice versa).
                  </p>
                ) : null}
              </Card>

              {/* Who claimed this promo */}
              <Card className="space-y-2 p-4">
                <h3 className="font-semibold">Claimants ({stats.claims})</h3>
                <p className="text-xs text-slate-500">
                  Everyone who claimed this promo, from any page or button. "Pending sign-up" rewards
                  attach when that email creates an account. Founders granted here also appear on the
                  Founding Members page.
                </p>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-slate-400">
                      <tr><th className="py-1">Email / phone</th><th>Founding</th><th>Claimed</th></tr>
                    </thead>
                    <tbody>
                      {claims.map((cl) => (
                        <tr key={cl.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="py-1.5">{cl.email ?? cl.phone ?? "signed-in user"}</td>
                          <td>{cl.granted_founding ? "🏅 granted" : draft.grants_founding_member ? "pending sign-up" : ", "}</td>
                          <td className="text-slate-500">{new Date(cl.claimed_at).toLocaleString()}</td>
                        </tr>
                      ))}
                      {claims.length === 0 ? (
                        <tr><td colSpan={3} className="py-4 text-center text-slate-400">No claims yet.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="flex justify-end">
                <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
              </div>
            </div>

            {/* Live preview */}
            <div className="xl:sticky xl:top-4 xl:self-start">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">
                Live preview: {activePage.name ?? activePage.key}
              </p>
              <div className="flex justify-center rounded-2xl bg-slate-100 p-4 dark:bg-slate-900">
                <PromoWidget promo={previewPromo} onDismiss={() => {}} onClaim={async (fields) => ({ ok: true, message: draft.design.pages.find((p) => p.key === fields.pageKey)?.ctas.find((c) => c.id === fields.ctaId)?.successMessage })} />
              </div>
            </div>
          </div>
        ) : (
          <Card className="flex items-center justify-center p-12 text-sm text-slate-400">
            Select a promotion or create one from a template.
          </Card>
        )}
      </div>
    </div>
  );
}

function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function fromLocal(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}
