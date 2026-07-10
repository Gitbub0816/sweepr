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
import { Card, Button, Input, Textarea, toast, PromoWidget, type PromoView } from "@sweepr/ui";
import { Megaphone, Plus, Copy, Trash2, Play, Pause, Archive, GripVertical } from "lucide-react";
import { useAuthedFetch } from "../lib/alerts";

type Audience = "all" | "visitors" | "customers" | "cleaners";
type Status = "draft" | "active" | "paused" | "expired" | "archived";

interface PromoBlock {
  type: "badge" | "heading" | "subheading" | "text" | "image" | "divider" | "spacer" | "bullets";
  text?: string;
  src?: string;
  items?: string[];
  align?: "left" | "center" | "right";
  size?: "sm" | "md" | "lg" | "xl";
}
interface Promo {
  id: string;
  slug: string;
  name: string;
  template_key: string | null;
  audience: Audience;
  status: Status;
  design: { theme?: string; accent?: string; background?: string; blocks: PromoBlock[] };
  cta: { label: string; action: "claim" | "link" | "dismiss"; url?: string; requireField?: "none" | "email" | "phone"; successMessage?: string };
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
      design: draft.design as PromoView["design"], cta: draft.cta as PromoView["cta"],
      grantsFoundingMember: draft.grants_founding_member,
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
                      <option value="claim">Claim</option><option value="link">Open link</option><option value="dismiss">Dismiss</option>
                    </select>
                  </label>
                  {draft.cta.action === "claim" ? (
                    <label className="text-xs">Required field
                      <select value={draft.cta.requireField ?? "none"} onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, requireField: e.target.value as Promo["cta"]["requireField"] } })}
                        className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                        <option value="none">None</option><option value="email">Email</option><option value="phone">Phone</option>
                      </select>
                    </label>
                  ) : null}
                  {draft.cta.action === "link" ? (
                    <label className="text-xs">Link URL
                      <Input value={draft.cta.url ?? ""} onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, url: e.target.value } })} className="mt-1" />
                    </label>
                  ) : null}
                </div>
                {draft.cta.action === "claim" ? (
                  <label className="block text-xs">Success message
                    <Input value={draft.cta.successMessage ?? ""} onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, successMessage: e.target.value } })} className="mt-1" />
                  </label>
                ) : null}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.grants_founding_member}
                    onChange={(e) => setDraft({ ...draft, grants_founding_member: e.target.checked })} />
                  Claiming grants Founding Member status (requires signed-in customer/cleaner audience)
                </label>
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
                      <option value="modal">Modal</option><option value="banner">Banner</option><option value="inline">Inline</option>
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
