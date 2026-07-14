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
import { useAuth } from "@clerk/clerk-react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Config {
  randomnessFloor: number;
  freeDeclinesPerDay: number;
  offerExpiryMinutes: number;
  maxCandidates: number;
}

/**
 * Admin controls for the automated assignment engine — how random vs.
 * deterministic cleaner selection is, how many cleaners are queued per job,
 * how long an offer stays open, and how many free declines a cleaner gets
 * before declines start hurting their acceptance rate.
 */
export function AssignmentConfigCard() {
  const { getToken } = useAuth();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [defaults, setDefaults] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const token = await getToken();
    const res = await fetch(`${API}/admin/automation/assignment-config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const d = (await res.json()) as { config: Config; defaults: Config };
      setCfg(d.config);
      setDefaults(d.defaults);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  function set<K extends keyof Config>(k: K, v: number) {
    setCfg((c) => (c ? { ...c, [k]: v } : c));
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/automation/assignment-config`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error();
      toast.success("Assignment settings saved");
    } catch {
      toast.error("Couldn't save assignment settings.");
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1 flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-seafoam-600" />
        <h2 className="font-semibold text-charcoal dark:text-white">Assignment engine</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        How the platform automatically chooses cleaners for new jobs. Selection is a weighted
        random draw, the floor below controls how much it leans to the best match vs. chance.
      </p>

      <div className="space-y-5">
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="floor" className="text-sm font-medium text-charcoal dark:text-slate-200">
              Randomness floor
            </label>
            <span className="text-sm tabular-nums text-slate-500">{cfg.randomnessFloor.toFixed(2)}</span>
          </div>
          <input
            id="floor" type="range" min={0} max={0.9} step={0.05}
            value={cfg.randomnessFloor}
            onChange={(e) => set("randomnessFloor", Number(e.target.value))}
            className="mt-1 w-full accent-seafoam-600"
          />
          <p className="mt-1 text-xs text-slate-400">
            0 = strongly favor the top match · higher = more evenly spread / more chance. Default {defaults?.randomnessFloor}.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <NumberField label="Free declines / day" value={cfg.freeDeclinesPerDay} min={0} max={20}
            onChange={(v) => set("freeDeclinesPerDay", v)} hint={`Default ${defaults?.freeDeclinesPerDay}`} />
          <NumberField label="Offer expiry (min)" value={cfg.offerExpiryMinutes} min={1} max={1440}
            onChange={(v) => set("offerExpiryMinutes", v)} hint={`Default ${defaults?.offerExpiryMinutes}`} />
          <NumberField label="Cleaners queued / job" value={cfg.maxCandidates} min={1} max={25}
            onChange={(v) => set("maxCandidates", v)} hint={`Default ${defaults?.maxCandidates}`} />
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={saving}
            className="rounded-lg bg-seafoam-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-seafoam-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save settings"}
          </button>
          {defaults && (
            <button type="button" onClick={() => setCfg(defaults)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
              <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function NumberField({ label, value, min, max, onChange, hint }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-charcoal dark:text-slate-200">{label}</label>
      <input
        type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-1.5 text-sm dark:border-slate-700"
      />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
