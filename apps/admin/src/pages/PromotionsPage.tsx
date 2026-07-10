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
 * Admin Promotions — a designer for single-page promotion widgets.
 *
 * Left: promotion list + "new from template". Right: the selected promo's
 * designer (design blocks, templated CTA, display rules, expiry) with a live
 * PromoWidget preview, its public slug URL (shareable / embeddable), and claim
 * stats. Founding Member templates are seeded automatically by the API.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Button, Input, Textarea, toast, PromoWidget, type PromoView, type PromoCanvas } from "@sweepr/ui";
import { PromoCanvasEditor } from "../components/PromoCanvasEditor";
import { Megaphone, Plus, Copy, Trash2, Play, Pause, Archive, GripVertical } from "lucide-react";
import { useAuthedFetch } from "../lib/alerts";

type Audience = "all" | "visitors" | "customers" | "cleaners";
type Status = "draft" | "active" | "paused" | "expired" | "archived";

interface PromoHotspot { x: number; y: number; w: number; h: number; cta: PromoCta }
interface PromoBlock {
  type: "badge" | "heading" | "subheading" | "text" | "image" | "divider" | "spacer" | "bullets";
  text?: string;
  src?: string;
  items?: string[];
  align?: "left" | "center" | "right";
  size?: "sm" | "md" | "lg" | "xl";
}
interface PromoCta {
  label: string;
  action: "claim" | "newsletter" | "waitlist" | "book_now" | "link" | "dismiss";
  url?: string;
  requireField?: "none" | "email" | "phone";
  claimants?: "anonymous" | "signed_in" | "both";
  secondary?: { label: string; url: string };
  successMessage?: string;
}
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
  design: { theme?: string; accent?: string; background?: string; blocks: PromoBlock[]; poster?: { src: string; hotspots?: PromoHotspot[] }; canvas?: PromoCanvas };
  reward?: { coupon?: RewardCoupon };
  cta: PromoCta;
  display: { placement?: string; pages?: string[]; delaySeconds?: number; persist?: boolean; frequency?: "once" | "every_visit" | "daily"; showOnFirstVisit?: boolean };
  starts_at: string | null;
  expires_at: string | null;
  max_claims: number | null;
  claim_count: number;
  view_count: number;
  grants_founding_member: boolean;
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

const BLOCK_TYPES: PromoBlock["type"][] = [
  "badge", "heading", "subheading", "text", "bullets", "image", "divider", "spacer",
];

export function PromotionsPage() {
  const authed = useAuthedFetch();
  const [list, setList] = useState<Promo[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Promo | null>(null);
  const [stats, setStats] = useState<{ claims: number; founders: number }>({ claims: 0, founders: 0 });
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
      setStats(data.stats);
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
          cta: draft.cta,
          display: draft.display,
          reward: draft.reward ?? {},
          startsAt: draft.starts_at,
          expiresAt: draft.expires_at,
          maxClaims: draft.max_claims,
          grantsFoundingMember: draft.grants_founding_member,
        }),
      });
      if (!res.ok) { toast.error("Save failed"); return; }
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

  const previewPromo: PromoView | null = useMemo(
    () => draft ? {
      id: draft.id, slug: draft.slug, name: draft.name,
      audience: draft.audience,
      design: draft.design as PromoView["design"], cta: draft.cta as PromoView["cta"],
      grantsFoundingMember: draft.grants_founding_member,
      reward: draft.reward as PromoView["reward"],
    } : null,
    [draft],
  );

  function patchBlock(i: number, patch: Partial<PromoBlock>) {
    if (!draft) return;
    const blocks = draft.design.blocks.map((b, idx) => idx === i ? { ...b, ...patch } : b);
    setDraft({ ...draft, design: { ...draft.design, blocks } });
  }
  function addBlock() {
    if (!draft) return;
    setDraft({ ...draft, design: { ...draft.design, blocks: [...draft.design.blocks, { type: "text", text: "New text", align: "center" }] } });
  }
  function removeBlock(i: number) {
    if (!draft) return;
    setDraft({ ...draft, design: { ...draft.design, blocks: draft.design.blocks.filter((_, idx) => idx !== i) } });
  }
  function moveBlock(i: number, dir: -1 | 1) {
    if (!draft) return;
    const blocks = [...draft.design.blocks];
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    setDraft({ ...draft, design: { ...draft.design, blocks } });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Megaphone className="h-6 w-6 text-seafoam-600" />
        <div>
          <h1 className="text-2xl font-bold">Promotions</h1>
          <p className="text-sm text-slate-500">Design promo widgets, publish a shareable URL, and grant Founding Member status.</p>
        </div>
      </header>

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
                  <span className="truncate">{p.name}</span>
                  <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_TONE[p.status]}`}>{p.status}</span>
                </button>
              ))}
              {list.length === 0 ? <p className="px-1 py-2 text-xs text-slate-400">No promotions yet.</p> : null}
            </div>
          </Card>
        </div>

        {/* ── Designer ── */}
        {draft && previewPromo ? (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="flex-1" />
                  <span className={`rounded-full px-2 py-1 text-xs ${STATUS_TONE[draft.status]}`}>{draft.status}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {draft.status !== "active" ? <Button size="sm" onClick={() => setStatus("active")}><Play className="mr-1 h-4 w-4" />Activate</Button> : null}
                  {draft.status === "active" ? <Button size="sm" variant="secondary" onClick={() => setStatus("paused")}><Pause className="mr-1 h-4 w-4" />Pause</Button> : null}
                  <Button size="sm" variant="secondary" onClick={() => setStatus("archived")}><Archive className="mr-1 h-4 w-4" />Archive</Button>
                  <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>
                </div>

                {/* Shareable URL */}
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                  <code className="flex-1 truncate">{publicUrl}</code>
                  <button onClick={() => { void navigator.clipboard.writeText(publicUrl); toast.success("URL copied"); }}
                    className="text-slate-500 hover:text-seafoam-600"><Copy className="h-4 w-4" /></button>
                </div>
                <p className="text-xs text-slate-500">Views: {draft.view_count} · Claims: {stats.claims}{draft.grants_founding_member ? ` · Founders granted: ${stats.founders}` : ""}</p>
              </Card>

              {/* Design blocks */}
              <Card className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Design</h3>
                  <Button size="sm" variant="secondary" onClick={addBlock}><Plus className="mr-1 h-4 w-4" />Add block</Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">Theme
                    <select value={draft.design.theme ?? "light"} onChange={(e) => setDraft({ ...draft, design: { ...draft.design, theme: e.target.value } })}
                      className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                      <option value="light">Light</option><option value="dark">Dark</option><option value="brand">Brand</option>
                    </select>
                  </label>
                  <label className="text-xs">Accent color
                    <Input type="text" value={draft.design.accent ?? ""} placeholder="#0f766e"
                      onChange={(e) => setDraft({ ...draft, design: { ...draft.design, accent: e.target.value } })} className="mt-1" />
                  </label>
                </div>

                <div className="space-y-2">
                  {draft.design.blocks.map((b, i) => (
                    <div key={i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                      <div className="mb-1.5 flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-slate-300" />
                        <select value={b.type} onChange={(e) => patchBlock(i, { type: e.target.value as PromoBlock["type"] })}
                          className="rounded-md border border-slate-200 bg-transparent px-1.5 py-1 text-xs dark:border-slate-700">
                          {BLOCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select value={b.align ?? "left"} onChange={(e) => patchBlock(i, { align: e.target.value as PromoBlock["align"] })}
                          className="rounded-md border border-slate-200 bg-transparent px-1.5 py-1 text-xs dark:border-slate-700">
                          <option value="left">left</option><option value="center">center</option><option value="right">right</option>
                        </select>
                        {b.type === "heading" ? (
                          <select value={b.size ?? "lg"} onChange={(e) => patchBlock(i, { size: e.target.value as PromoBlock["size"] })}
                            className="rounded-md border border-slate-200 bg-transparent px-1.5 py-1 text-xs dark:border-slate-700">
                            <option value="sm">sm</option><option value="md">md</option><option value="lg">lg</option><option value="xl">xl</option>
                          </select>
                        ) : null}
                        <div className="ml-auto flex gap-1">
                          <button onClick={() => moveBlock(i, -1)} className="px-1 text-slate-400 hover:text-slate-700">↑</button>
                          <button onClick={() => moveBlock(i, 1)} className="px-1 text-slate-400 hover:text-slate-700">↓</button>
                          <button onClick={() => removeBlock(i)} className="px-1 text-red-400 hover:text-red-600">✕</button>
                        </div>
                      </div>
                      {b.type === "bullets" ? (
                        <Textarea rows={3} value={(b.items ?? []).join("\n")} placeholder="One bullet per line"
                          onChange={(e) => patchBlock(i, { items: e.target.value.split("\n").filter(Boolean) })} />
                      ) : b.type === "image" ? (
                        <Input value={b.src ?? ""} placeholder="https://objects.getsweepr.com/…" onChange={(e) => patchBlock(i, { src: e.target.value })} />
                      ) : b.type === "divider" || b.type === "spacer" ? (
                        <p className="text-xs text-slate-400">No content</p>
                      ) : (
                        <Textarea rows={2} value={b.text ?? ""} onChange={(e) => patchBlock(i, { text: e.target.value })} />
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              {/* CTA */}
              <Card className="space-y-3 p-4">
                <h3 className="font-semibold">Call to action</h3>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">Button label
                    <Input value={draft.cta.label} onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, label: e.target.value } })} className="mt-1" />
                  </label>
                  <label className="text-xs">Action
                    <select value={draft.cta.action} onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, action: e.target.value as Promo["cta"]["action"] } })}
                      className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                      <option value="claim">Claim (record + grant reward)</option>
                      <option value="newsletter">Newsletter sign-up (+ reward)</option>
                      <option value="waitlist">Join waitlist (+ reward)</option>
                      <option value="book_now">Book now (flash offer + reward)</option>
                      <option value="link">Open link</option>
                      <option value="dismiss">Dismiss</option>
                    </select>
                  </label>
                  {["claim","newsletter","waitlist","book_now"].includes(draft.cta.action) ? (
                    <label className="text-xs">Required field
                      <select value={draft.cta.requireField ?? "none"} onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, requireField: e.target.value as Promo["cta"]["requireField"] } })}
                        className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                        <option value="none">None</option><option value="email">Email</option><option value="phone">Phone</option>
                      </select>
                    </label>
                  ) : null}
                  {draft.cta.action === "link" || draft.cta.action === "book_now" ? (
                    <label className="text-xs">{draft.cta.action === "book_now" ? "Booking URL (redirect after claim)" : "Link URL"}
                      <Input value={draft.cta.url ?? ""} onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, url: e.target.value } })} className="mt-1" />
                    </label>
                  ) : null}
                </div>
                {["claim","newsletter","waitlist","book_now"].includes(draft.cta.action) ? (
                  <label className="block text-xs">Success message
                    <Input value={draft.cta.successMessage ?? ""} onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, successMessage: e.target.value } })} className="mt-1" />
                  </label>
                ) : null}
                {["claim","newsletter","waitlist","book_now"].includes(draft.cta.action) ? (
                  <label className="block text-xs">Who can claim
                    <select
                      value={draft.cta.claimants ?? "both"}
                      onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, claimants: e.target.value as "anonymous" | "signed_in" | "both" } })}
                      className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                    >
                      <option value="both">Anyone — signed in or not</option>
                      <option value="anonymous">Marketing visitors only (signed-out)</option>
                      <option value="signed_in">Signed-in only ("Sign in to claim" for visitors)</option>
                    </select>
                  </label>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">Secondary button label (optional)
                    <Input value={draft.cta.secondary?.label ?? ""} placeholder="I want to be a cleaner instead"
                      onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, secondary: { label: e.target.value, url: draft.cta.secondary?.url ?? "" } } })} className="mt-1" />
                  </label>
                  <label className="text-xs">Secondary button URL
                    <Input value={draft.cta.secondary?.url ?? ""} placeholder="https://getsweepr.com/clean-with-us"
                      onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, secondary: { label: draft.cta.secondary?.label ?? "", url: e.target.value } } })} className="mt-1" />
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
                    signs up with the same email. One founding status per person — a cleaner-founder
                    can never also claim customer-founder (and vice versa).
                  </p>
                ) : null}
              </Card>

              {/* Reward — the coupon this promo grants (coupons are silent: they
                  sit on the account and apply automatically at booking) */}
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
                      ) : (
                        <label className="text-xs">{rc.kind === "percent_off" ? "Percent (1–100)" : "Amount (cents)"}
                          <Input type="number" min={1} value={rc.value ?? 0} onChange={(e) => patch({ value: Number(e.target.value) })} className="mt-1" />
                        </label>
                      )}
                      <label className="text-xs">Coupon title (shown on the account)
                        <Input value={rc.title ?? ""} placeholder="15% off your next booking" onChange={(e) => patch({ title: e.target.value })} className="mt-1" />
                      </label>
                      <label className="text-xs">Uses per person
                        <Input type="number" min={1} value={rc.maxRedemptions ?? 1} onChange={(e) => patch({ maxRedemptions: Number(e.target.value) })} className="mt-1" />
                      </label>
                      <label className="text-xs">Valid days (max 180 — legal cap)
                        <Input type="number" min={1} max={180} value={rc.validDays ?? 180} onChange={(e) => patch({ validDays: Math.min(Number(e.target.value), 180) })} className="mt-1" />
                      </label>
                      <label className="text-xs">Flash offer window (minutes, optional)
                        <Input type="number" min={0} value={rc.offerMinutes ?? ""} placeholder="15 = expires 15 min after claiming"
                          onChange={(e) => patch({ offerMinutes: e.target.value ? Number(e.target.value) : undefined })} className="mt-1" />
                      </label>
                      <label className="text-xs">Min booking total (cents, optional)
                        <Input type="number" min={0} value={rc.minBookingTotalCents ?? ""} onChange={(e) => patch({ minBookingTotalCents: e.target.value ? Number(e.target.value) : undefined })} className="mt-1" />
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
                        Each person can claim this promo's coupon ONCE — enforced per account and per
                        email at the database. Coupons are silent — no widget. They appear in the person's account and apply
                        automatically to the next qualifying booking. Anonymous claims capture an email;
                        the coupon activates when that person signs up (required to claim, per the
                        Promotions &amp; Coupons Terms).
                      </p>
                    </div>
                  );
                })() : null}
              </Card>

              {/* Slide designer — free-form PowerPoint-grade canvas */}
              <Card className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Slide designer (free-form)</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={Boolean(draft.design.canvas)}
                      onChange={(e) => setDraft({ ...draft, design: { ...draft.design, canvas: e.target.checked ? (draft.design.canvas ?? { aspect: "4:5", background: "#ffffff", elements: [] }) : undefined } })} />
                    Enabled
                  </label>
                </div>
                {draft.design.canvas ? (
                  <PromoCanvasEditor
                    promoId={draft.id}
                    canvas={draft.design.canvas}
                    onChange={(cv) => setDraft({ ...draft, design: { ...draft.design, canvas: cv } })}
                    authed={authed}
                  />
                ) : (
                  <p className="text-xs text-slate-500">
                    One-slide PowerPoint-style editor: text boxes, photos, shapes, and CTA buttons —
                    positioned freely, layered, rotated. Takes precedence over blocks and poster mode.
                  </p>
                )}
              </Card>

              {/* Poster — the whole widget is one uploaded image; drag on it to
                  draw interactive hotspots and assign each a CTA */}
              <Card className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Poster mode (full-image)</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={Boolean(draft.design.poster?.src)}
                      onChange={(e) => setDraft({ ...draft, design: { ...draft.design, poster: e.target.checked ? { src: draft.design.poster?.src ?? "", hotspots: draft.design.poster?.hotspots ?? [] } : undefined } })} />
                    Enabled
                  </label>
                </div>
                {draft.design.poster !== undefined ? (
                  <PosterEditor
                    promoId={draft.id}
                    poster={draft.design.poster}
                    onChange={(poster) => setDraft({ ...draft, design: { ...draft.design, poster } })}
                    authed={authed}
                  />
                ) : (
                  <p className="text-xs text-slate-500">
                    Replaces the block design with a single uploaded image (like a one-slide poster).
                    Drag on the image to draw hotspots and assign each a CTA.
                  </p>
                )}
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
                      <option value="modal">Popup — overlays the page after the delay</option>
                      <option value="banner">Banner — slim top strip; “View offer” expands the popup</option>
                      <option value="inline">Embedded — in-page / direct /promo link only</option>
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
              </Card>

              <div className="flex justify-end">
                <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
              </div>
            </div>

            {/* Live preview */}
            <div className="xl:sticky xl:top-4 xl:self-start">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Live preview</p>
              <div className="flex justify-center rounded-2xl bg-slate-100 p-4 dark:bg-slate-900">
                <PromoWidget promo={previewPromo} onDismiss={() => {}} onClaim={async () => ({ ok: true, message: previewPromo.cta.successMessage })} />
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

/**
 * Poster editor: upload the poster image (admin 'promo' storage scope → R2),
 * then drag on the preview to draw interactive hotspots. Each hotspot gets an
 * assigned CTA (the "assign CTA" flow) — label + action + optional URL. All
 * geometry is stored as % of the image so it scales with the widget.
 */
function PosterEditor({
  promoId,
  poster,
  onChange,
  authed,
}: {
  promoId: string;
  poster: { src: string; hotspots?: PromoHotspot[] };
  onChange: (p: { src: string; hotspots?: PromoHotspot[] }) => void;
  authed: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [uploading, setUploading] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  async function upload(file: File) {
    setUploading(true);
    try {
      const sign = await authed("/storage/sign-upload", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          purpose: "promo_asset",
          scope: "promo",
          refId: promoId,
        }),
      });
      if (!sign.ok) { toast.error("Upload authorization failed"); return; }
      const { uploadUrl, publicUrl, requiredHeaders } = (await sign.json()) as {
        uploadUrl: string; publicUrl: string; requiredHeaders: Record<string, string>;
      };
      const put = await fetch(uploadUrl, { method: "PUT", headers: requiredHeaders, body: file });
      if (!put.ok) { toast.error("Upload failed"); return; }
      onChange({ ...poster, src: publicUrl });
      toast.success("Poster uploaded");
    } finally { setUploading(false); }
  }

  function pct(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function finishDraw() {
    if (drawRect && drawRect.w > 2 && drawRect.h > 2) {
      const label = window.prompt("Hotspot CTA label (what does clicking here do?)", "Claim offer");
      if (label) {
        onChange({
          ...poster,
          hotspots: [
            ...(poster.hotspots ?? []),
            { ...drawRect, cta: { label, action: "claim", requireField: "none" } },
          ],
        });
      }
    }
    setDrawStart(null);
    setDrawRect(null);
  }

  const hotspots = poster.hotspots ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={poster.src} placeholder="https://objects.getsweepr.com/promos/…"
          onChange={(e) => onChange({ ...poster, src: e.target.value })} className="flex-1" />
        <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:border-seafoam-400 dark:border-slate-700">
          {uploading ? "Uploading…" : "Upload image"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        </label>
      </div>

      {poster.src ? (
        <>
          <p className="text-xs text-slate-500">Drag on the image to draw a hotspot, then assign its CTA below.</p>
          <div
            className="relative select-none overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
            onMouseDown={(e) => { const p0 = pct(e); setDrawStart(p0); setDrawRect({ ...p0, w: 0, h: 0 }); }}
            onMouseMove={(e) => {
              if (!drawStart) return;
              const p1 = pct(e);
              setDrawRect({
                x: Math.min(drawStart.x, p1.x), y: Math.min(drawStart.y, p1.y),
                w: Math.abs(p1.x - drawStart.x), h: Math.abs(p1.y - drawStart.y),
              });
            }}
            onMouseUp={finishDraw}
            onMouseLeave={() => { if (drawStart) finishDraw(); }}
          >
            <img src={poster.src} alt="Poster" className="block w-full" draggable={false} />
            {hotspots.map((h, i) => (
              <div key={i}
                className="absolute flex items-center justify-center rounded border-2 border-seafoam-500 bg-seafoam-500/15 text-[10px] font-bold text-seafoam-700"
                style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%` }}>
                {i + 1}
              </div>
            ))}
            {drawRect ? (
              <div className="absolute rounded border-2 border-dashed border-amber-500 bg-amber-400/15"
                style={{ left: `${drawRect.x}%`, top: `${drawRect.y}%`, width: `${drawRect.w}%`, height: `${drawRect.h}%` }} />
            ) : null}
          </div>

          {hotspots.map((h, i) => (
            <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-end gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
              <span className="pb-1.5 text-xs font-bold text-seafoam-700">#{i + 1}</span>
              <label className="text-xs">CTA label
                <Input value={h.cta.label} onChange={(e) => {
                  const hs = hotspots.map((x, j) => j === i ? { ...x, cta: { ...x.cta, label: e.target.value } } : x);
                  onChange({ ...poster, hotspots: hs });
                }} className="mt-1" />
              </label>
              <label className="text-xs">Action
                <select value={h.cta.action} onChange={(e) => {
                  const hs = hotspots.map((x, j) => j === i ? { ...x, cta: { ...x.cta, action: e.target.value as PromoCta["action"] } } : x);
                  onChange({ ...poster, hotspots: hs });
                }} className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                  <option value="claim">Claim (+ reward)</option>
                  <option value="newsletter">Newsletter (+ reward)</option>
                  <option value="waitlist">Waitlist (+ reward)</option>
                  <option value="book_now">Book now</option>
                  <option value="link">Open link</option>
                  <option value="dismiss">Dismiss</option>
                </select>
              </label>
              <label className="text-xs">URL (link / book now)
                <Input value={h.cta.url ?? ""} onChange={(e) => {
                  const hs = hotspots.map((x, j) => j === i ? { ...x, cta: { ...x.cta, url: e.target.value } } : x);
                  onChange({ ...poster, hotspots: hs });
                }} className="mt-1" />
              </label>
              <Button size="sm" variant="ghost" onClick={() => onChange({ ...poster, hotspots: hotspots.filter((_, j) => j !== i) })}>✕</Button>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
