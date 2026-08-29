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
 * Admin — Team Cleans crew configuration editor (GET/PUT /admin/crew-config).
 * Edits the operational staffing knobs (crew_config) plus the Team Cleans
 * feature flags. Pricing-facing efficiency knobs live in the pricing version,
 * not here.
 */
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Button, Badge, toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "";

interface CrewConfig {
  maxCrewSize: number;
  crewInvitationTtlMinutes: number;
  parallelInvitationCount: number;
  minUsefulMinutesPerCleaner: number;
  maxSoloElapsedMinutes: number;
  targetMaxElapsedMinutes: number;
  leadOverheadMinutes: number;
  crewSizeThresholdsPersonMinutes: Record<string, number>;
  payoutSplitByCrewSize: Record<string, number[]>;
}

type FlagKey = "enabled" | "autoSizing" | "autoMatching" | "taskAllocation" | "preferredTeammates";
type Flags = Record<FlagKey, boolean>;

interface ConfigResponse {
  config: CrewConfig;
  flags: Flags;
}

const FLAG_META: { key: FlagKey; label: string; hint: string }[] = [
  { key: "enabled", label: "Team Cleans", hint: "Master switch. Off means every booking staffs solo, exactly as before." },
  { key: "autoSizing", label: "Auto crew sizing", hint: "Size crews from the booking's labor estimate. Off crews only when a customer buys an extra cleaner." },
  { key: "autoMatching", label: "Auto crew matching", hint: "Invite candidates to open member seats automatically." },
  { key: "taskAllocation", label: "Task allocation", hint: "Split the job's rooms and tasks across the crew." },
  { key: "preferredTeammates", label: "Preferred teammates", hint: "Give a matching bonus to cleaners who work well together." },
];

const NUM_FIELDS: {
  key: keyof Pick<
    CrewConfig,
    | "maxCrewSize"
    | "crewInvitationTtlMinutes"
    | "parallelInvitationCount"
    | "minUsefulMinutesPerCleaner"
    | "maxSoloElapsedMinutes"
    | "targetMaxElapsedMinutes"
    | "leadOverheadMinutes"
  >;
  label: string;
  hint: string;
  min: number;
  max: number;
}[] = [
  { key: "maxCrewSize", label: "Max crew size", hint: "App-enforced ceiling on seats per booking.", min: 1, max: 10 },
  { key: "crewInvitationTtlMinutes", label: "Invitation TTL (minutes)", hint: "How long a seat invitation stays open before it expires and cascades.", min: 1, max: 120 },
  { key: "parallelInvitationCount", label: "Parallel invitations", hint: "Candidates invited at once per open member seat.", min: 1, max: 20 },
  { key: "minUsefulMinutesPerCleaner", label: "Min useful minutes / cleaner", hint: "A helper seat below this is dropped as too little work.", min: 15, max: 600 },
  { key: "maxSoloElapsedMinutes", label: "Max solo elapsed (minutes)", hint: "A solo shift longer than this pushes the job toward a crew.", min: 60, max: 1440 },
  { key: "targetMaxElapsedMinutes", label: "Target max elapsed (minutes)", hint: "Preferred ceiling on a crew's on-site time.", min: 60, max: 1440 },
  { key: "leadOverheadMinutes", label: "Lead overhead (minutes)", hint: "Extra work the lead carries for walkthrough and completion.", min: 0, max: 240 },
];

export function CrewConfigPage() {
  const { getToken } = useAuth();
  const [form, setForm] = useState<CrewConfig | null>(null);
  const [flags, setFlags] = useState<Flags | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/crew-config`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as ConfigResponse;
      setForm(body.config);
      setFlags(body.flags);
    } catch {
      toast.error("Could not load crew configuration.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  function setNum(key: keyof CrewConfig, value: number) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function setThreshold(size: string, value: number) {
    setForm((f) =>
      f ? { ...f, crewSizeThresholdsPersonMinutes: { ...f.crewSizeThresholdsPersonMinutes, [size]: value } } : f,
    );
  }

  function setSplit(size: string, idx: number, value: number) {
    setForm((f) => {
      if (!f) return f;
      const arr = [...(f.payoutSplitByCrewSize[size] ?? [])];
      arr[idx] = value;
      return { ...f, payoutSplitByCrewSize: { ...f.payoutSplitByCrewSize, [size]: arr } };
    });
  }

  function splitSum(size: string): number {
    return Math.round((form?.payoutSplitByCrewSize[size] ?? []).reduce((a, b) => a + (Number(b) || 0), 0));
  }

  async function save() {
    if (!form || !flags) return;
    // Every payout split must sum to 100 before we send.
    const bad = Object.keys(form.payoutSplitByCrewSize).find((size) => splitSum(size) !== 100);
    if (bad) {
      toast.error(`Payout split for a ${bad}-person crew must total 100%.`);
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/crew-config`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ config: form, flags }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as ConfigResponse;
      setForm(body.config);
      setFlags(body.flags);
      toast.success("Crew configuration saved.");
    } catch {
      toast.error("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form || !flags) {
    return (
      <DashboardShell title="Team Cleans" description="Crew staffing configuration.">
        <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </DashboardShell>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-charcoal dark:text-white";

  return (
    <DashboardShell
      title="Team Cleans"
      description="Configure how Sweepr staffs multi-cleaner crews."
      actions={<Button onClick={save} loading={saving}>Save changes</Button>}
    >
      <div className="max-w-3xl space-y-6">
        {/* Feature flags */}
        <Card className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-charcoal dark:text-white">Feature flags</h2>
            <p className="mt-1 text-xs text-slate-500">
              With Team Cleans off, every booking staffs solo. Turn it on to enable crews.
            </p>
          </div>
          <div className="space-y-2">
            {FLAG_META.map((f) => (
              <label
                key={f.key}
                className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
              >
                <span>
                  <span className="flex items-center gap-2 text-sm font-medium text-charcoal dark:text-white">
                    {f.label}
                    {flags[f.key] ? <Badge variant="success">On</Badge> : <Badge>Off</Badge>}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{f.hint}</span>
                </span>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-seafoam-600"
                  checked={flags[f.key]}
                  onChange={(e) => setFlags((prev) => (prev ? { ...prev, [f.key]: e.target.checked } : prev))}
                  aria-label={f.label}
                />
              </label>
            ))}
          </div>
        </Card>

        {/* Numeric knobs */}
        <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-charcoal dark:text-white">Staffing thresholds</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {NUM_FIELDS.map((fld) => (
              <div key={fld.key}>
                <label htmlFor={`cfg-${fld.key}`} className="mb-1 block text-xs font-medium text-slate-500">
                  {fld.label}
                </label>
                <input
                  id={`cfg-${fld.key}`}
                  type="number"
                  min={fld.min}
                  max={fld.max}
                  className={inputCls}
                  value={String(form[fld.key])}
                  onChange={(e) => setNum(fld.key, Number(e.target.value))}
                />
                <p className="mt-1 text-xs text-slate-400">{fld.hint}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Crew-size thresholds by labor volume */}
        <Card className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-charcoal dark:text-white">Crew-size thresholds</h2>
            <p className="mt-1 text-xs text-slate-500">
              Person-minute ceilings that floor the recommended crew size by labor volume.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {Object.keys(form.crewSizeThresholdsPersonMinutes)
              .sort((a, b) => Number(a) - Number(b))
              .map((size) => (
                <div key={size}>
                  <label htmlFor={`thr-${size}`} className="mb-1 block text-xs font-medium text-slate-500">
                    Up to {size}-person (min)
                  </label>
                  <input
                    id={`thr-${size}`}
                    type="number"
                    min={0}
                    max={100000}
                    className={inputCls}
                    value={String(form.crewSizeThresholdsPersonMinutes[size])}
                    onChange={(e) => setThreshold(size, Number(e.target.value))}
                  />
                </div>
              ))}
          </div>
        </Card>

        {/* Payout splits */}
        <Card className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-charcoal dark:text-white">Payout pool splits</h2>
            <p className="mt-1 text-xs text-slate-500">
              How the cleaner payout pool divides across a crew, lead first. Each row must total 100%.
              Tips are separate: they stay 100% to the tipped cleaner.
            </p>
          </div>
          <div className="space-y-3">
            {Object.keys(form.payoutSplitByCrewSize)
              .sort((a, b) => Number(a) - Number(b))
              .map((size) => {
                const sum = splitSum(size);
                const ok = sum === 100;
                return (
                  <div key={size} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-charcoal dark:text-white">{size}-person crew</span>
                      <Badge variant={ok ? "success" : "error"}>{sum}%</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(form.payoutSplitByCrewSize[size] ?? []).map((pct, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <span className="text-xs text-slate-500">{idx === 0 ? "Lead" : `Helper ${idx}`}</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            aria-label={`${size}-person crew, ${idx === 0 ? "lead" : `helper ${idx}`} percentage`}
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-charcoal dark:text-white"
                            value={String(pct)}
                            onChange={(e) => setSplit(size, idx, Number(e.target.value))}
                          />
                          <span className="text-xs text-slate-400">%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>

        <div className="flex justify-end">
          <Button onClick={save} loading={saving}>Save changes</Button>
        </div>
      </div>
    </DashboardShell>
  );
}
