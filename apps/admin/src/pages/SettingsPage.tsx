/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Input, Button, toast } from "@sweepr/ui";
import { SlackSettings } from "../components/SlackSettings";
import { AlertPrefsPanel } from "../components/AlertPrefsPanel";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface PlatformSettings {
  platformName: string;
  supportEmail: string;
  serviceFeePct: number;
  taxRatePct: number;
}

function PrelaunchSettingsPanel() {
  const { getToken } = useAuth();
  const [settings, setSettings] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const bearer = await getToken();
    const res = await fetch(`${API}/admin/status/settings`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (res.ok) setSettings(await res.json() as Record<string, string | undefined>);
    else toast.error("Failed to load prelaunch settings");
    setLoading(false);
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  async function patch(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    const bearer = await getToken();
    const res = await fetch(`${API}/admin/status/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) {
      toast.error("Failed to update setting");
      void load();
    }
  }

  return (
    <Card className="max-w-lg space-y-4">
      <h2 className="text-sm font-semibold text-charcoal dark:text-white">Prelaunch gates</h2>
      <p className="text-sm text-gray-500">
        While a gate is on, that app shows the prelaunch screen to everyone
        without a bypass code. Flip it off to launch.
      </p>
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-3">
          {([
            { key: "prelaunch_customer", label: "Customer app in prelaunch" },
            { key: "prelaunch_cleaner", label: "Cleaner app in prelaunch" },
          ] as const).map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={settings[key] === "true"}
                onChange={(e) => void patch(key, e.target.checked ? "true" : "false")}
                className="h-4 w-4 rounded border-slate-300 text-seafoam-500 focus:ring-seafoam-400"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
            </label>
          ))}
        </div>
      )}
    </Card>
  );
}

function AdminInvitePanel() {
  const { getToken } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setLink("");
    try {
      const bearer = await getToken();
      const resp = await fetch(`${API}/admin/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ email }),
      });
      const data = await resp.json() as { ok?: boolean; link?: string; error?: string };
      if (!resp.ok || !data.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Invite sent to ${email}`);
      setLink(data.link ?? "");
      setEmail("");
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Could not send invite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-lg space-y-4">
      <h2 className="text-sm font-semibold text-charcoal dark:text-white">Invite Admin</h2>
      <p className="text-sm text-gray-500">
        Send a one-time invite link. The recipient must use it within 7 days.
      </p>
      <form onSubmit={send} className="flex gap-2">
        <Input
          label=""
          type="email"
          placeholder="admin@example.com"
          value={email}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          required
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !email}>
          {loading ? "Sending…" : "Send invite"}
        </Button>
      </form>
      {link && (
        <div className="rounded-lg bg-teal-50 border border-teal-200 p-3">
          <p className="text-xs font-medium text-teal-700 mb-1">Invite link (copy as backup)</p>
          <p className="text-xs text-teal-600 break-all font-mono">{link}</p>
        </div>
      )}
    </Card>
  );
}

function GeneralSettingsPanel() {
  const { getToken } = useAuth();
  const [settings, setSettings] = useState<PlatformSettings>({
    platformName: "Sweepr",
    supportEmail: "support@getsweepr.com",
    serviceFeePct: 10,
    taxRatePct: 8.25,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/admin/settings`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error();
        const data = await res.json() as PlatformSettings;
        setSettings(data);
      } catch {
        // use defaults already in state
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  async function save() {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      toast.success("Settings saved");
    } catch {
      toast.error("Couldn't save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-lg space-y-4">
      <h2 className="text-sm font-semibold text-charcoal dark:text-white">General</h2>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : (
        <>
          <Input
            label="Platform name"
            value={settings.platformName}
            onChange={(e) => setSettings((s) => ({ ...s, platformName: e.target.value }))}
          />
          <Input
            label="Support email"
            type="email"
            value={settings.supportEmail}
            onChange={(e) => setSettings((s) => ({ ...s, supportEmail: e.target.value }))}
          />
          <Input
            label="Service fee (%)"
            type="number"
            value={settings.serviceFeePct}
            onChange={(e) => setSettings((s) => ({ ...s, serviceFeePct: parseFloat(e.target.value) || 0 }))}
          />
          <Input
            label="Tax rate (%)"
            type="number"
            value={settings.taxRatePct}
            onChange={(e) => setSettings((s) => ({ ...s, taxRatePct: parseFloat(e.target.value) || 0 }))}
          />
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </>
      )}
    </Card>
  );
}

// Scope Review settings — a flat key/value bag stored under `scope_review.*` in
// site_settings, edited here in dollars/days/percent and converted at the boundary.
const SR_KEYS = {
  feeSmall: "scope_review.fee_additional_attention_small_cents",
  feeMedium: "scope_review.fee_additional_attention_medium_cents",
  feeLarge: "scope_review.fee_additional_attention_large_cents",
  refusalMin: "scope_review.refusal_fee_min_cents",
  refusalMax: "scope_review.refusal_fee_max_cents",
  refusalPct: "scope_review.refusal_fee_pct",
  surchargeExtra: "scope_review.level_surcharge_extra_attention_pct",
  surchargeSignificant: "scope_review.level_surcharge_significant_attention_pct",
  abuseRequestRate: "scope_review.abuse_request_rate_pct",
  abuseDenialRate: "scope_review.abuse_denial_rate_pct",
  abuseMinJobs: "scope_review.abuse_min_jobs",
  privilegeDisableDays: "scope_review.privilege_disable_days",
  suspensionDays: "scope_review.suspension_days",
  investigatingDays: "scope_review.investigating_days",
  autoCancel: "scope_review.auto_cancel_on_high_confidence_refusal",
} as const;

const CENTS_FIELDS = new Set(["feeSmall", "feeMedium", "feeLarge", "refusalMin", "refusalMax"]);

type SrField = keyof typeof SR_KEYS;

function ScopeReviewSettingsPanel() {
  const { getToken } = useAuth();
  const [values, setValues] = useState<Record<SrField, string>>({
    feeSmall: "25", feeMedium: "50", feeLarge: "100",
    refusalMin: "50", refusalMax: "200", refusalPct: "20",
    surchargeExtra: "0", surchargeSignificant: "0",
    abuseRequestRate: "70", abuseDenialRate: "70", abuseMinJobs: "10",
    privilegeDisableDays: "180", suspensionDays: "180", investigatingDays: "180",
    autoCancel: "false",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
    });
  }, [getToken]);

  useEffect(() => {
    (async () => {
      try {
        const res = await authed("/admin/settings/scope-review");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { settings: Record<string, string> };
        setValues((v) => {
          const next = { ...v };
          for (const field of Object.keys(SR_KEYS) as SrField[]) {
            const raw = data.settings[SR_KEYS[field]];
            if (raw === undefined) continue;
            next[field] = CENTS_FIELDS.has(field) ? String(Number(raw) / 100) : raw;
          }
          return next;
        });
      } catch {
        // keep defaults
      } finally {
        setLoading(false);
      }
    })();
  }, [authed]);

  function set(field: SrField, val: string) {
    setValues((v) => ({ ...v, [field]: val }));
  }

  async function save() {
    setSaving(true);
    try {
      const settings: Record<string, string> = {};
      for (const field of Object.keys(SR_KEYS) as SrField[]) {
        const raw = values[field];
        settings[SR_KEYS[field]] = CENTS_FIELDS.has(field)
          ? String(Math.round(parseFloat(raw || "0") * 100))
          : raw;
      }
      const res = await authed("/admin/settings/scope-review", { method: "PATCH", body: JSON.stringify({ settings }) });
      if (!res.ok) throw new Error();
      toast.success("Scope Review settings saved");
    } catch {
      toast.error("Couldn't save Scope Review settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className="max-w-2xl space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">Fees</h3>
        <div className="grid grid-cols-3 gap-3">
          <Input label="AAF, small ($)" type="number" value={values.feeSmall} onChange={(e) => set("feeSmall", e.target.value)} />
          <Input label="AAF, medium ($)" type="number" value={values.feeMedium} onChange={(e) => set("feeMedium", e.target.value)} />
          <Input label="AAF, large ($)" type="number" value={values.feeLarge} onChange={(e) => set("feeLarge", e.target.value)} />
          <Input label="Refusal fee min ($)" type="number" value={values.refusalMin} onChange={(e) => set("refusalMin", e.target.value)} />
          <Input label="Refusal fee max ($)" type="number" value={values.refusalMax} onChange={(e) => set("refusalMax", e.target.value)} />
          <Input label="Refusal fee (%)" type="number" value={values.refusalPct} onChange={(e) => set("refusalPct", e.target.value)} />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">Level surcharges</h3>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Extra attention (%)" type="number" value={values.surchargeExtra} onChange={(e) => set("surchargeExtra", e.target.value)} />
          <Input label="Significant attention (%)" type="number" value={values.surchargeSignificant} onChange={(e) => set("surchargeSignificant", e.target.value)} />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">Abuse thresholds</h3>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Request rate (%)" type="number" value={values.abuseRequestRate} onChange={(e) => set("abuseRequestRate", e.target.value)} />
          <Input label="Denial rate (%)" type="number" value={values.abuseDenialRate} onChange={(e) => set("abuseDenialRate", e.target.value)} />
          <Input label="Min jobs" type="number" value={values.abuseMinJobs} onChange={(e) => set("abuseMinJobs", e.target.value)} />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">Durations (days)</h3>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Privilege disable" type="number" value={values.privilegeDisableDays} onChange={(e) => set("privilegeDisableDays", e.target.value)} />
          <Input label="Suspension" type="number" value={values.suspensionDays} onChange={(e) => set("suspensionDays", e.target.value)} />
          <Input label="Investigating" type="number" value={values.investigatingDays} onChange={(e) => set("investigatingDays", e.target.value)} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-charcoal dark:text-white">
        <input
          type="checkbox"
          checked={values.autoCancel === "true"}
          onChange={(e) => set("autoCancel", e.target.checked ? "true" : "false")}
          className="h-4 w-4 rounded border-slate-300"
        />
        Auto-cancel booking on high-confidence refusal
      </label>

      <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Scope Review settings"}</Button>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <DashboardShell title="Settings" description="Platform-wide configuration.">
      <div className="space-y-6">
        <GeneralSettingsPanel />
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Launch</h2>
          <PrelaunchSettingsPanel />
        </div>
        <AdminInvitePanel />
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">My account</h2>
          <AlertPrefsPanel />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Scope Review</h2>
          <ScopeReviewSettingsPanel />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Slack</h2>
          <SlackSettings />
        </div>
      </div>
    </DashboardShell>
  );
}
