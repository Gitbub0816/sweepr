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
import { KeyRound } from "lucide-react";
import { Card, Button, toast } from "@sweepr/ui";
import { useAuthedFetch } from "../lib/alerts";

interface Config {
  smartEntryEnabled: boolean;
  manualCodeEnabled: boolean;
  remoteUnlockEnabled: boolean;
  scheduledPinEnabled: boolean;
  sweeprPlusEnabled: boolean;
  nonmemberFeeCents: number;
  memberIncluded: boolean;
  accessStartOffsetMinutes: number;
  accessEndOffsetMinutes: number;
  maxGeofenceRadiusMeters: number;
  maxLocationAgeSeconds: number;
  maxLocationAccuracyMeters: number;
  requireBiometric: boolean;
  reauthMaxAgeSeconds: number;
  maxUnlockAttemptsPer10Min: number;
  maxCodeRevealsPerBooking: number;
  plusMonthlyPriceCents: number;
  plusAnnualPriceCents: number;
  plusDiscountPercent: number;
  plusMonthlyDiscountCapCents: number;
  plusGraceDays: number;
}

const TOGGLES: Array<{ key: keyof Config; label: string; hint: string }> = [
  { key: "smartEntryEnabled", label: "Smart Entry enabled", hint: "Master switch, customer/cleaner Smart Entry flows." },
  { key: "sweeprPlusEnabled", label: "Sweepr+ enabled", hint: "Membership checkout + member discount." },
  { key: "manualCodeEnabled", label: "Manual codes", hint: "Customer-provided keypad codes / lockbox." },
  { key: "remoteUnlockEnabled", label: "Remote unlock", hint: "Server-triggered unlock/lock via Seam." },
  { key: "scheduledPinEnabled", label: "Scheduled PINs", hint: "Auto-generated temporary smart-lock codes." },
  { key: "memberIncluded", label: "Included for members", hint: "Members get Smart Entry at $0." },
  { key: "requireBiometric", label: "Require recent reauth", hint: "Cleaner must re-authenticate before reveal/unlock." },
];

const NUMBERS: Array<{ key: keyof Config; label: string; suffix?: string; cents?: boolean }> = [
  { key: "nonmemberFeeCents", label: "Non-member fee", cents: true },
  { key: "plusMonthlyPriceCents", label: "Sweepr+ monthly", cents: true },
  { key: "plusAnnualPriceCents", label: "Sweepr+ annual", cents: true },
  { key: "plusDiscountPercent", label: "Member discount", suffix: "%" },
  { key: "plusMonthlyDiscountCapCents", label: "Monthly discount cap", cents: true },
  { key: "plusGraceDays", label: "Past-due grace", suffix: "days" },
  { key: "accessStartOffsetMinutes", label: "Access starts before", suffix: "min" },
  { key: "accessEndOffsetMinutes", label: "Access ends after", suffix: "min" },
  { key: "maxGeofenceRadiusMeters", label: "Max geofence", suffix: "m" },
  { key: "maxLocationAgeSeconds", label: "Max location age", suffix: "s" },
  { key: "maxLocationAccuracyMeters", label: "Max location accuracy", suffix: "m" },
  { key: "reauthMaxAgeSeconds", label: "Reauth max age", suffix: "s" },
  { key: "maxUnlockAttemptsPer10Min", label: "Unlock attempts / 10 min" },
  { key: "maxCodeRevealsPerBooking", label: "Code reveals / booking" },
];

export function SmartEntryPage() {
  const authed = useAuthedFetch();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await authed("/admin/smart-entry/config");
    if (res.ok) setCfg(((await res.json()) as { config: Config }).config);
  }, [authed]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await authed("/admin/smart-entry/config", {
        method: "PUT",
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error();
      toast.success("Smart Entry settings saved");
    } catch {
      toast.error("Couldn't save settings");
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <div className="p-6 text-slate-500">Loading…</div>;

  const set = <K extends keyof Config>(k: K, v: Config[K]) => setCfg({ ...cfg, [k]: v });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="h-6 w-6 text-seafoam-700" />
        <h1 className="text-xl font-black text-charcoal dark:text-white">Smart Entry &amp; Sweepr+</h1>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-bold text-charcoal dark:text-white">Feature flags</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {TOGGLES.map((t) => (
            <label key={t.key} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <input
                type="checkbox"
                checked={cfg[t.key] as boolean}
                onChange={(e) => set(t.key, e.target.checked as Config[typeof t.key])}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-semibold text-charcoal dark:text-white">{t.label}</span>
                <span className="block text-xs text-slate-500">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-bold text-charcoal dark:text-white">Pricing &amp; limits</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {NUMBERS.map((n) => (
            <label key={n.key} className="block">
              <span className="block text-xs font-medium text-slate-500">
                {n.label} {n.cents ? "($)" : n.suffix ? `(${n.suffix})` : ""}
              </span>
              <input
                type="number"
                value={n.cents ? (cfg[n.key] as number) / 100 : (cfg[n.key] as number)}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  set(n.key, (n.cents ? Math.round(raw * 100) : raw) as Config[typeof n.key]);
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
      </div>
    </div>
  );
}
