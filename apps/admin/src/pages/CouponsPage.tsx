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
 * Admin Coupons — the perks ledger behind promos. Grant coupons manually
 * (themed or plain), watch redemptions, and manage milestone rules
 * ("100th customer", "2 years as a cleaner", …) that mint coupons on the cron.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Input, toast } from "@sweepr/ui";
import { TicketPercent, Plus, Play } from "lucide-react";
import { useAuthedFetch } from "../lib/alerts";

interface Coupon {
  id: string;
  code: string;
  title: string;
  theme: string | null;
  kind: "percent_off" | "amount_off" | "free_addon";
  value: number;
  addon_key: string | null;
  email: string | null;
  owner_email: string | null;
  source: string;
  source_ref: string | null;
  max_redemptions: number;
  redemption_count: number;
  expires_at: string;
  status: string;
}

interface MilestoneRule {
  id: string;
  rule_key: string;
  label: string;
  kind: string;
  threshold: number;
  coupon: { kind: string; value?: number; addonKey?: string; theme?: string };
  active: boolean;
  awarded: number;
}

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  exhausted: "bg-slate-100 text-slate-500 dark:bg-slate-800",
  expired: "bg-slate-100 text-slate-400 dark:bg-slate-800",
  revoked: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function describe(cp: Coupon): string {
  if (cp.kind === "percent_off") return `${cp.value}% off`;
  if (cp.kind === "amount_off") return `$${(cp.value / 100).toFixed(2)} off`;
  return `Free ${cp.addon_key ?? "add-on"}`;
}

export function CouponsPage() {
  const authed = useAuthedFetch();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [rules, setRules] = useState<MilestoneRule[]>([]);
  const [q, setQ] = useState("");

  // Grant form
  const [gEmail, setGEmail] = useState("");
  const [gKind, setGKind] = useState<"percent_off" | "amount_off" | "free_addon">("percent_off");
  const [gValue, setGValue] = useState("15");
  const [gAddon, setGAddon] = useState("");
  const [gTheme, setGTheme] = useState("");
  const [gDays, setGDays] = useState("180");
  const [gUses, setGUses] = useState("1");

  // Milestone form
  const [mKey, setMKey] = useState("");
  const [mLabel, setMLabel] = useState("");
  const [mKind, setMKind] = useState("nth_customer");
  const [mThreshold, setMThreshold] = useState("100");
  const [mCKind, setMCKind] = useState<"percent_off" | "amount_off" | "free_addon">("percent_off");
  const [mCValue, setMCValue] = useState("20");

  const load = useCallback(async () => {
    const [cr, mr] = await Promise.all([
      authed(`/admin/coupons${q ? `?q=${encodeURIComponent(q)}` : ""}`),
      authed("/admin/coupons/milestones"),
    ]);
    if (cr.ok) setCoupons(((await cr.json()) as { coupons: Coupon[] }).coupons);
    if (mr.ok) setRules(((await mr.json()) as { rules: MilestoneRule[] }).rules);
  }, [authed, q]);

  useEffect(() => { void load(); }, [load]);

  async function grant() {
    if (!gEmail.trim()) return;
    const res = await authed("/admin/coupons", {
      method: "POST",
      body: JSON.stringify({
        email: gEmail.trim(),
        template: {
          kind: gKind,
          value: gKind === "free_addon" ? 0 : Number(gValue),
          addonKey: gKind === "free_addon" ? gAddon : undefined,
          theme: gTheme || undefined,
          validDays: Math.min(Number(gDays) || 180, 180),
          maxRedemptions: Number(gUses) || 1,
        },
      }),
    });
    if (res.ok) { toast.success("Coupon granted"); setGEmail(""); await load(); }
    else toast.error("Grant failed");
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this coupon?")) return;
    const res = await authed(`/admin/coupons/${id}/revoke`, { method: "POST" });
    if (res.ok) { toast.success("Revoked"); await load(); }
  }

  async function addRule() {
    if (!mKey.trim() || !mLabel.trim()) return;
    const res = await authed("/admin/coupons/milestones", {
      method: "POST",
      body: JSON.stringify({
        ruleKey: mKey.trim(),
        label: mLabel.trim(),
        kind: mKind,
        threshold: Number(mThreshold) || 1,
        coupon: { kind: mCKind, value: mCKind === "free_addon" ? 0 : Number(mCValue), addonKey: mCKind === "free_addon" ? gAddon : undefined },
      }),
    });
    if (res.ok) { toast.success("Milestone added"); setMKey(""); setMLabel(""); await load(); }
    else toast.error("Add failed (rule key taken?)");
  }

  async function runMilestones() {
    const res = await authed("/admin/coupons/milestones/run", { method: "POST" });
    if (res.ok) {
      const d = (await res.json()) as { granted: number };
      toast.success(`Milestones evaluated — ${d.granted} coupon(s) granted`);
      await load();
    }
  }

  async function toggleRule(r: MilestoneRule) {
    const res = await authed(`/admin/coupons/milestones/${r.id}`, {
      method: "PUT", body: JSON.stringify({ active: !r.active }),
    });
    if (res.ok) await load();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <TicketPercent className="h-6 w-6 text-seafoam-600" />
        <div>
          <h1 className="text-2xl font-bold">Coupons</h1>
          <p className="text-sm text-slate-500">
            Silent perks: they sit on the account and apply automatically to the next qualifying booking.
            Sign-up required to claim; 180-day maximum validity.
          </p>
        </div>
      </header>

      {/* Manual / themed grant */}
      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">Grant a coupon</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <label className="text-xs">Recipient email
            <Input value={gEmail} onChange={(e) => setGEmail(e.target.value)} placeholder="them@example.com" className="mt-1" />
          </label>
          <label className="text-xs">Type
            <select value={gKind} onChange={(e) => setGKind(e.target.value as typeof gKind)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
              <option value="percent_off">% off</option><option value="amount_off">$ off (cents)</option><option value="free_addon">Free add-on</option>
            </select>
          </label>
          {gKind === "free_addon" ? (
            <label className="text-xs">Add-on key
              <Input value={gAddon} onChange={(e) => setGAddon(e.target.value)} placeholder="inside_fridge" className="mt-1" />
            </label>
          ) : (
            <label className="text-xs">Value
              <Input type="number" value={gValue} onChange={(e) => setGValue(e.target.value)} className="mt-1" />
            </label>
          )}
          <label className="text-xs">Theme (optional)
            <Input value={gTheme} onChange={(e) => setGTheme(e.target.value)} placeholder="valentines / christmas" className="mt-1" />
          </label>
          <label className="text-xs">Valid days (≤180)
            <Input type="number" max={180} value={gDays} onChange={(e) => setGDays(e.target.value)} className="mt-1" />
          </label>
          <label className="text-xs">Uses
            <Input type="number" min={1} value={gUses} onChange={(e) => setGUses(e.target.value)} className="mt-1" />
          </label>
          <div className="flex items-end"><Button onClick={grant}><Plus className="mr-1 h-4 w-4" />Grant</Button></div>
        </div>
      </Card>

      {/* Milestones */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Milestone rules</h3>
          <Button size="sm" variant="secondary" onClick={runMilestones}><Play className="mr-1 h-4 w-4" />Evaluate now</Button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <label className="text-xs">Rule key
            <Input value={mKey} onChange={(e) => setMKey(e.target.value)} placeholder="customer-100" className="mt-1" />
          </label>
          <label className="text-xs">Label
            <Input value={mLabel} onChange={(e) => setMLabel(e.target.value)} placeholder="Our 100th customer!" className="mt-1" />
          </label>
          <label className="text-xs">Kind
            <select value={mKind} onChange={(e) => setMKind(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
              <option value="nth_customer">Nth customer</option>
              <option value="nth_cleaner">Nth approved cleaner</option>
              <option value="nth_completed_booking">Nth completed clean</option>
              <option value="cleaner_anniversary_years">Cleaner anniversary (years)</option>
              <option value="customer_anniversary_years">Customer anniversary (years)</option>
            </select>
          </label>
          <label className="text-xs">N / years
            <Input type="number" min={1} value={mThreshold} onChange={(e) => setMThreshold(e.target.value)} className="mt-1" />
          </label>
          <label className="text-xs">Coupon
            <select value={mCKind} onChange={(e) => setMCKind(e.target.value as typeof mCKind)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
              <option value="percent_off">% off</option><option value="amount_off">$ off (cents)</option><option value="free_addon">Free add-on</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            {mCKind !== "free_addon" ? (
              <Input type="number" value={mCValue} onChange={(e) => setMCValue(e.target.value)} className="w-20" />
            ) : null}
            <Button size="sm" onClick={addRule}>Add</Button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr><th className="py-1">Rule</th><th>Kind</th><th>N</th><th>Awarded</th><th>Active</th></tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5">{r.label} <span className="text-xs text-slate-400">({r.rule_key})</span></td>
                <td className="text-slate-500">{r.kind}</td>
                <td>{r.threshold}</td>
                <td>{r.awarded}</td>
                <td>
                  <button onClick={() => toggleRule(r)}
                    className={`rounded-full px-2 py-0.5 text-xs ${r.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {r.active ? "on" : "off"}
                  </button>
                </td>
              </tr>
            ))}
            {rules.length === 0 ? <tr><td colSpan={5} className="py-4 text-center text-slate-400">No milestone rules yet.</td></tr> : null}
          </tbody>
        </table>
      </Card>

      {/* Ledger */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">All coupons</h3>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code or email…" className="w-64" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr><th className="py-1">Code</th><th>Perk</th><th>Owner</th><th>Source</th><th>Uses</th><th>Expires</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {coupons.map((cp) => (
                <tr key={cp.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1.5 font-mono text-xs">{cp.code}</td>
                  <td>{describe(cp)}{cp.theme ? <span className="ml-1 text-xs text-slate-400">({cp.theme})</span> : null}</td>
                  <td className="text-slate-500">{cp.owner_email ?? cp.email ?? "—"}{!cp.owner_email && cp.email ? " (pending sign-up)" : ""}</td>
                  <td className="text-slate-500">{cp.source}{cp.source_ref ? `:${cp.source_ref}` : ""}</td>
                  <td>{cp.redemption_count}/{cp.max_redemptions}</td>
                  <td className="text-slate-500">{new Date(cp.expires_at).toLocaleDateString()}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[cp.status] ?? ""}`}>{cp.status}</span></td>
                  <td className="text-right">
                    {cp.status === "active" ? (
                      <Button size="sm" variant="ghost" onClick={() => revoke(cp.id)}>Revoke</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {coupons.length === 0 ? <tr><td colSpan={8} className="py-6 text-center text-slate-400">No coupons yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
