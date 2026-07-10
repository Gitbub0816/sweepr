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
 * Admin Founding Members — enrollment window config + the member roster with
 * grant / revoke / restore controls, for both cleaners and customers.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Input, toast, FoundingMemberBadge } from "@sweepr/ui";
import { Award, Save } from "lucide-react";
import { useAuthedFetch } from "../lib/alerts";

type Audience = "cleaner" | "customer";

interface Config {
  cleanerEnrollmentOpen: boolean;
  customerEnrollmentOpen: boolean;
  cleanerCutoffAt: string;
  customerCutoffAt: string;
  cleanerMaxMembers: number | string;
  customerMaxMembers: number | string;
  earningsBonusPct: number;
  sinceLabel: string;
}
interface Member {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  founding_member: boolean;
  founding_member_id: number | null;
  founding_member_since: string | null;
  founding_member_revoked: boolean;
  founding_member_revoked_reason: string | null;
}

export function FoundingMembersPage() {
  const authed = useAuthedFetch();
  const [config, setConfig] = useState<Config | null>(null);
  const [counts, setCounts] = useState({ cleaner_members: 0, customer_members: 0 });
  const [audience, setAudience] = useState<Audience>("cleaner");
  const [members, setMembers] = useState<Member[]>([]);
  const [grantId, setGrantId] = useState("");
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    const res = await authed("/admin/founding/config");
    if (res.ok) {
      const data = (await res.json()) as { config: Config; counts: typeof counts };
      setConfig(data.config);
      setCounts(data.counts);
    }
  }, [authed]);

  const loadMembers = useCallback(async () => {
    const res = await authed(`/admin/founding/members?audience=${audience}`);
    if (res.ok) setMembers(((await res.json()) as { members: Member[] }).members);
  }, [authed, audience]);

  useEffect(() => { void loadConfig(); }, [loadConfig]);
  useEffect(() => { void loadMembers(); }, [loadMembers]);

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await authed("/admin/founding/config", { method: "PUT", body: JSON.stringify(config) });
      if (res.ok) { toast.success("Settings saved"); await loadConfig(); }
      else toast.error("Save failed");
    } finally { setSaving(false); }
  }

  async function grant() {
    if (!grantId.trim()) return;
    const res = await authed("/admin/founding/grant", { method: "POST", body: JSON.stringify({ audience, id: grantId.trim() }) });
    if (!res.ok) { toast.error("Grant failed — check the ID"); return; }
    const result = (await res.json()) as { status: string };
    if (result.status === "already_other_audience") {
      toast.error(`This person already holds founding status as a ${audience === "cleaner" ? "customer" : "cleaner"} — it can only be held on one account type. Revoke that one first.`);
      return;
    }
    toast.success(result.status === "already_member" ? "Already a member" : "Granted");
    setGrantId("");
    await loadMembers();
    await loadConfig();
  }
  async function revoke(id: string) {
    const reason = window.prompt("Reason for revoking Founding Member status?");
    if (!reason) return;
    const res = await authed("/admin/founding/revoke", { method: "POST", body: JSON.stringify({ audience, id, reason }) });
    if (res.ok) { toast.success("Revoked"); await loadMembers(); await loadConfig(); }
  }
  async function restore(id: string) {
    const res = await authed("/admin/founding/restore", { method: "POST", body: JSON.stringify({ audience, id }) });
    if (res.ok) { toast.success("Restored"); await loadMembers(); await loadConfig(); }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Award className="h-6 w-6 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold">Founding Members</h1>
          <p className="text-sm text-slate-500">Enrollment window, earnings bonus, and the founder roster.</p>
        </div>
      </header>

      {/* Config */}
      {config ? (
        <Card className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <legend className="px-1 text-sm font-semibold">Cleaners · {counts.cleaner_members} founders</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={config.cleanerEnrollmentOpen}
                  onChange={(e) => setConfig({ ...config, cleanerEnrollmentOpen: e.target.checked })} />
                Enrollment open
              </label>
              <label className="block text-xs">Cutoff date (blank = none)
                <Input type="datetime-local" value={toLocal(config.cleanerCutoffAt)} onChange={(e) => setConfig({ ...config, cleanerCutoffAt: fromLocal(e.target.value) })} className="mt-1" />
              </label>
              <label className="block text-xs">Max members (blank = unlimited)
                <Input type="number" value={config.cleanerMaxMembers} onChange={(e) => setConfig({ ...config, cleanerMaxMembers: e.target.value })} className="mt-1" />
              </label>
            </fieldset>

            <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <legend className="px-1 text-sm font-semibold">Customers · {counts.customer_members} founders</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={config.customerEnrollmentOpen}
                  onChange={(e) => setConfig({ ...config, customerEnrollmentOpen: e.target.checked })} />
                Enrollment open
              </label>
              <label className="block text-xs">Cutoff date (blank = none)
                <Input type="datetime-local" value={toLocal(config.customerCutoffAt)} onChange={(e) => setConfig({ ...config, customerCutoffAt: fromLocal(e.target.value) })} className="mt-1" />
              </label>
              <label className="block text-xs">Max members (blank = unlimited)
                <Input type="number" value={config.customerMaxMembers} onChange={(e) => setConfig({ ...config, customerMaxMembers: e.target.value })} className="mt-1" />
              </label>
            </fieldset>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-xs">Cleaner earnings bonus (%)
              <Input type="number" step="0.5" value={config.earningsBonusPct} onChange={(e) => setConfig({ ...config, earningsBonusPct: Number(e.target.value) })} className="mt-1" />
            </label>
            <label className="block text-xs">"Founding Member since" label
              <Input value={config.sinceLabel} onChange={(e) => setConfig({ ...config, sinceLabel: e.target.value })} className="mt-1" />
            </label>
          </div>

          <div className="flex justify-end">
            <Button onClick={saveConfig} disabled={saving}><Save className="mr-1 h-4 w-4" />{saving ? "Saving…" : "Save settings"}</Button>
          </div>
        </Card>
      ) : null}

      {/* Roster */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            {(["cleaner", "customer"] as Audience[]).map((a) => (
              <button key={a} onClick={() => setAudience(a)}
                className={`px-3 py-1.5 text-sm capitalize ${audience === a ? "bg-seafoam-600 text-white" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                {a}s
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input value={grantId} onChange={(e) => setGrantId(e.target.value)} placeholder={`${audience} id (uuid)`} className="w-64" />
            <Button size="sm" onClick={grant}>Grant</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr><th className="py-2">#</th><th>Name</th><th>Email</th><th>Since</th><th>Status</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 tabular-nums">{m.founding_member_id ?? "—"}</td>
                  <td>{[m.first_name, m.last_name].filter(Boolean).join(" ") || "—"}</td>
                  <td className="text-slate-500">{m.email}</td>
                  <td className="text-slate-500">{m.founding_member_since ? new Date(m.founding_member_since).toLocaleDateString() : "—"}</td>
                  <td>
                    {m.founding_member ? <FoundingMemberBadge founderId={m.founding_member_id} showTooltip={false} />
                      : <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">Revoked</span>}
                  </td>
                  <td className="text-right">
                    {m.founding_member
                      ? <Button size="sm" variant="ghost" onClick={() => revoke(m.id)}>Revoke</Button>
                      : <Button size="sm" variant="secondary" onClick={() => restore(m.id)}>Restore</Button>}
                  </td>
                </tr>
              ))}
              {members.length === 0 ? <tr><td colSpan={6} className="py-6 text-center text-slate-400">No {audience} founders yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function toLocal(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function fromLocal(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}
