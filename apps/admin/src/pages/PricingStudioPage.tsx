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
 * Pricing Studio — the guided workspace for the versioned Pricing v2 engine
 * (labor-minutes model). Talks to /admin/pricing-v2. Key rules the UI
 * enforces visually (the API enforces them for real):
 *  - Published versions are immutable; edits happen on a DRAFT clone.
 *  - An unmistakable state banner always says whether customers are affected.
 *  - Every number carries its unit; admins edit MINUTES and DOLLARS, never
 *    opaque coefficients.
 *  - Previews run the production engine server-side (never a UI reimplementation).
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  Archive,
  BadgeDollarSign,
  BedDouble,
  CalendarClock,
  ClipboardCheck,
  Clock,
  Copy,
  FlaskConical,
  Grid3x3,
  History,
  Inbox,
  LayoutDashboard,
  Plus,
  Rocket,
  Settings2,
  Sparkles,
  Truck,
  Wand2,
} from "lucide-react";
import { Button, Card, Modal, toast } from "@sweepr/ui";
import { cn } from "@sweepr/utils";
import { buildDefaultExtendedRules, type ExtendedRulesV2 } from "@sweepr/quote-engine";
import { usePermissions } from "../lib/permissions";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

const ROOM_TYPES = ["kitchen", "bathroom", "bedroom", "living_room"] as const;
type RoomType = (typeof ROOM_TYPES)[number];
const ROOM_LABELS: Record<RoomType, string> = {
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  bedroom: "Bedroom",
  living_room: "Living/common area",
};
const LEVEL_LABELS = [
  "1 · Lightly used",
  "2 · Everyday mess",
  "3 · Needs attention",
  "4 · Heavy condition",
];

// Mirrors PricingConfigV2 (packages/quote-engine/src/types.ts).
interface Config {
  /** 2 = extended multi-service ruleset; absent/1 = legacy standard-only. */
  formatVersion?: 1 | 2;
  /** Multi-service rules (Move-In/Out, Airbnb/STR, deep clean, short-notice
   *  tiers, location tiers, extras overrides). Unknown sections round-trip
   *  untouched — the Studio edits only what it renders. */
  extendedRules?: ExtendedRulesV2;
  laborMatrix: Record<RoomType, [number, number, number, number]>;
  clutter: {
    minutesByType: Record<RoomType, [number, number, number]>;
    unobservedFactorPermille: number;
    obstructedRequiresReview: boolean;
  };
  size: { includedSqft: number; incrementSqft: number; minutesPerIncrement: number; maxAdjustmentMinutes: number };
  operational: { setupMinutes: number; packdownMinutes: number; perExtraRoomTransitionMinutes: number };
  extras: Array<{
    key: string;
    label: string;
    mode: "minutes" | "fixed" | "both";
    minutesPerUnit: number;
    fixedCentsPerUnit: number;
    unitLabel: string;
    minQuantity: number;
    maxQuantity: number;
    overlapGroup?: string;
    incompatibleWith?: string[];
    payoutTreatment: "standard" | "cleaner_full";
    active: boolean;
  }>;
  rates: {
    customerLaborRateCentsPerHour: number;
    fixedServiceCents: number;
    /** Optional job-total floor (pre-tax); absent/0 = no minimum. */
    minimumBookingCents?: number;
    maxAutoQuoteCents: number;
    taxRateBps: number;
    roundTotalUpToEndingDigit: number | null;
    emergencySurchargeBps: number;
  };
  payout: { mode: "per_labor_hour" | "percent_of_subtotal"; centsPerLaborHour: number; percentBps: number };
  scheduling: {
    reservePercentile: number;
    bufferRatePermille: number;
    roundUpToIncrementMinutes: number;
    teamProductivityPermille: Record<string, number>;
    twoPersonThresholdMinutes: number;
  };
  inference: {
    modelVersion: string;
    provenance: string;
    thresholds: Record<RoomType, [number, number, number]>;
    betaHome: Record<RoomType, number>;
    hGridPoints: number;
    hGridSpan: number;
  };
}

interface Version {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "active" | "superseded" | "archived";
  service_area: string;
  currency: string;
  config?: Config;
  inference_provenance: string;
  change_summary: string | null;
  effective_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Scenario {
  key: string;
  label: string;
  totalCents?: number;
  expectedLaborMinutes?: number;
  scheduledLaborMinutes?: number;
  cleanerPayoutCents?: number;
  marginCents?: number;
  error?: string;
  before?: Scenario | null;
}

function dollars(cents: number | undefined | null): string {
  return cents == null ? "—" : `$${(cents / 100).toFixed(2)}`;
}
function minutesLabel(min: number | undefined | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h ${min % 60}m` : `${min}m`;
}

function useApi() {
  const { getToken } = useAuth();
  return useCallback(
    async (path: string, init: RequestInit = {}) => {
      const token = await getToken();
      return fetch(`${API}/admin/pricing-v2/${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      });
    },
    [getToken],
  );
}

/** Numeric input that ALWAYS shows its unit. Value flows as the raw config
 *  unit (cents/minutes/bps); display converts for money. */
function NumField({
  label,
  unit,
  value,
  onChange,
  disabled,
  money,
  help,
  step,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  /** Render cents as dollars in the input. */
  money?: boolean;
  help?: string;
  step?: number;
}) {
  const display = money ? value / 100 : value;
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <div className="flex items-center gap-2">
        {money && <span className="text-sm text-slate-500">$</span>}
        <input
          type="number"
          value={Number.isFinite(display) ? display : 0}
          step={step ?? (money ? 0.01 : 1)}
          disabled={disabled}
          onChange={(e) => {
            const n = Number.parseFloat(e.target.value || "0");
            onChange(money ? Math.round(n * 100) : n);
          }}
          className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm tabular-nums disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800"
        />
        <span className="text-xs text-slate-500">{unit}</span>
      </div>
      {help && <span className="mt-1 block text-xs text-slate-400">{help}</span>}
    </label>
  );
}

function StateBanner({ version }: { version: Version | null }) {
  if (!version) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
        No pricing version selected — customers are priced by the legacy engine until a version is published.
      </div>
    );
  }
  const styles: Record<string, string> = {
    active: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
    draft: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-200",
    scheduled: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  };
  const text =
    version.status === "active"
      ? "Viewing active pricing — read only. Clone to a draft to make changes."
      : version.status === "draft"
        ? "Editing draft — customers are unaffected until you publish."
        : version.status === "scheduled"
          ? `Scheduled to go live ${version.effective_at ? new Date(version.effective_at).toLocaleString() : ""} (UTC-based) — read only.`
          : "Historical version — read only.";
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-2.5 text-sm font-medium",
        styles[version.status] ?? "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
      )}
    >
      {text} <span className="font-normal opacity-70">· {version.name}</span>
    </div>
  );
}

type Tab =
  | "overview"
  | "matrix"
  | "prediction"
  | "adjustments"
  | "extras"
  | "rates"
  | "moveinout"
  | "airbnb"
  | "rules"
  | "scheduling"
  | "test"
  | "proposals"
  | "publish"
  | "history";

const TABS: Array<{ id: Tab; label: string; icon: typeof Grid3x3 }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "matrix", label: "Room labor", icon: Grid3x3 },
  { id: "prediction", label: "Prediction", icon: Wand2 },
  { id: "adjustments", label: "Clutter & size", icon: Sparkles },
  { id: "extras", label: "Extras", icon: Plus },
  { id: "rates", label: "Rates & payout", icon: BadgeDollarSign },
  { id: "moveinout", label: "Move-In/Out", icon: Truck },
  { id: "airbnb", label: "Airbnb / STR", icon: BedDouble },
  { id: "rules", label: "Tiers & rules", icon: CalendarClock },
  { id: "scheduling", label: "Scheduling", icon: Clock },
  { id: "test", label: "Test quote", icon: FlaskConical },
  { id: "proposals", label: "Proposals", icon: Inbox },
  { id: "publish", label: "Review & publish", icon: Rocket },
  { id: "history", label: "History", icon: History },
];

export function PricingStudioPage() {
  const api = useApi();
  const { has } = usePermissions();
  const canPublish = has("content.pricing.publish");
  const canAdvanced = has("content.pricing.advanced_model");

  const [tab, setTab] = useState<Tab>("overview");
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Version | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const editable = selected?.status === "draft";

  const loadVersions = useCallback(async () => {
    const res = await api("versions");
    if (!res.ok) return;
    const data = (await res.json()) as { versions: Version[] };
    setVersions(data.versions);
    // Default selection: newest draft, else active, else newest.
    if (!selectedId) {
      const draft = data.versions.find((v) => v.status === "draft");
      const active = data.versions.find((v) => v.status === "active");
      const pick = draft ?? active ?? data.versions[0];
      if (pick) setSelectedId(pick.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const loadSelected = useCallback(async () => {
    if (!selectedId) return;
    const res = await api(`versions/${selectedId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { version: Version; scenarios: Scenario[] };
    setSelected(data.version);
    setConfig(data.version.config ?? null);
    setScenarios(data.scenarios);
    setDirty(false);
  }, [api, selectedId]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);
  useEffect(() => {
    void loadSelected();
  }, [loadSelected]);

  const patchConfig = (mut: (c: Config) => Config) => {
    if (!editable) return;
    setConfig((c) => (c ? mut(structuredClone(c)) : c));
    setDirty(true);
  };

  async function saveDraft(note?: string) {
    if (!selectedId || !config) return;
    setSaving(true);
    try {
      const res = await api(`versions/${selectedId}/config`, {
        method: "PUT",
        body: JSON.stringify({ config, note }),
      });
      const data = (await res.json().catch(() => null)) as
        | { validation?: { ok: boolean; errors: string[] }; error?: string; message?: string }
        | null;
      if (!res.ok) {
        toast.error(data?.message ?? data?.error ?? "Save failed");
        return;
      }
      if (data?.validation && !data.validation.ok) {
        toast.error(`Saved with ${data.validation.errors.length} validation error(s) — fix before publishing.`);
      } else {
        toast.success("Draft saved");
      }
      await loadSelected();
    } finally {
      setSaving(false);
    }
  }

  async function createDraft(sourceVersionId?: string) {
    const name = window.prompt(
      "Name for the new draft (e.g. \"Fall 2026 rates\"):",
      sourceVersionId ? "Copy of published pricing" : "Initial pricing (translated from current)",
    );
    if (!name) return;
    const res = await api("versions", {
      method: "POST",
      body: JSON.stringify({ name, sourceVersionId }),
    });
    if (!res.ok) {
      toast.error("Could not create draft");
      return;
    }
    const data = (await res.json()) as { version: Version };
    toast.success("Draft created — customers are unaffected until you publish.");
    await loadVersions();
    setSelectedId(data.version.id);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-charcoal dark:text-white">Pricing Studio</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Versioned labor-minutes pricing: edit a draft, preview the impact, publish when ready.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                [{v.status}] {v.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="secondary" onClick={() => void createDraft(selected?.id)} disabled={!selected}>
            <Copy className="mr-1 h-3.5 w-3.5" /> Clone to draft
          </Button>
          <Button size="sm" onClick={() => void createDraft()}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New draft
          </Button>
        </div>
      </div>

      <StateBanner version={selected} />

      <div className="-mb-px flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-seafoam-500 text-seafoam-700"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {dirty && editable && (
        <div className="flex items-center justify-between rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-200">
          <span>Unsaved draft changes.</span>
          <Button size="sm" loading={saving} onClick={() => void saveDraft()}>
            Save draft
          </Button>
        </div>
      )}

      {tab === "proposals" ? (
        <ProposalsTab
          api={api}
          onImported={(id) => {
            void loadVersions().then(() => {
              setSelectedId(id);
              setTab("overview");
            });
          }}
        />
      ) : !config ? (
        <Card>
          <p className="py-10 text-center text-sm text-slate-500">
            {versions.length === 0
              ? "No pricing versions yet. Create the first draft — it starts from the current live pricing, translated into labor minutes, and changes nothing until published."
              : "Loading version…"}
          </p>
        </Card>
      ) : (
        <>
          {tab === "overview" && <OverviewTab version={selected} config={config} scenarios={scenarios} versions={versions} />}
          {tab === "matrix" && <MatrixTab config={config} patch={patchConfig} editable={editable} rateCents={config.rates.customerLaborRateCentsPerHour} />}
          {tab === "prediction" && <PredictionTab api={api} versionId={selectedId} config={config} patch={patchConfig} editable={editable} canAdvanced={canAdvanced} />}
          {tab === "adjustments" && <AdjustmentsTab config={config} patch={patchConfig} editable={editable} />}
          {tab === "extras" && <ExtrasTab config={config} patch={patchConfig} editable={editable} />}
          {tab === "rates" && <RatesTab config={config} patch={patchConfig} editable={editable} />}
          {tab === "moveinout" && <MoveInOutTab config={config} patch={patchConfig} editable={editable} />}
          {tab === "airbnb" && <AirbnbTab config={config} patch={patchConfig} editable={editable} />}
          {tab === "rules" && <RulesTab config={config} patch={patchConfig} editable={editable} />}
          {tab === "scheduling" && <SchedulingTab config={config} patch={patchConfig} editable={editable} />}
          {tab === "test" && <TestQuoteTab api={api} versionId={selectedId} />}
          {tab === "publish" && (
            <PublishTab api={api} version={selected} canPublish={canPublish} onPublished={() => void loadVersions().then(loadSelected)} />
          )}
          {tab === "history" && (
            <HistoryTab api={api} versions={versions} onClone={(id) => void createDraft(id)} onChanged={() => void loadVersions()} />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewTab({
  version,
  config,
  scenarios,
  versions,
}: {
  version: Version | null;
  config: Config;
  scenarios: Scenario[];
  versions: Version[];
}) {
  const active = versions.find((v) => v.status === "active");
  const scheduled = versions.filter((v) => v.status === "scheduled");
  return (
    <div className="space-y-4">
      {!active && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Pricing v2 is not live yet.
          </p>
          <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-200/80">
            Customers are still priced by the legacy engine. Review this draft, run the
            test scenarios, and publish from “Review & publish” when the numbers are approved.
          </p>
        </Card>
      )}
      {scheduled.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-800">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            <CalendarClock className="h-4 w-4" />
            {scheduled.map((s) => `“${s.name}” goes live ${s.effective_at ? new Date(s.effective_at).toLocaleString() : "soon"}`).join(" · ")}
          </div>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-500">Customer labor rate</p>
          <p className="mt-1 text-2xl font-bold text-charcoal dark:text-white">
            {dollars(config.rates.customerLaborRateCentsPerHour)}
            <span className="text-sm font-normal text-slate-500"> / labor-hour</span>
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Minimum job total</p>
          <p className="mt-1 text-2xl font-bold text-charcoal dark:text-white">
            {(config.rates.minimumBookingCents ?? 0) > 0 ? dollars(config.rates.minimumBookingCents) : "None"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Cleaner payout basis</p>
          <p className="mt-1 text-2xl font-bold text-charcoal dark:text-white">
            {config.payout.mode === "per_labor_hour"
              ? `${dollars(config.payout.centsPerLaborHour)}`
              : `${(config.payout.percentBps / 100).toFixed(1)}%`}
            <span className="text-sm font-normal text-slate-500">
              {config.payout.mode === "per_labor_hour" ? " / labor-hour" : " of labor subtotal"}
            </span>
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Last published change</p>
          <p className="mt-1 text-sm font-medium text-charcoal dark:text-white">
            {active?.change_summary ?? "—"}
          </p>
          <p className="text-xs text-slate-500">
            {active?.published_at ? new Date(active.published_at).toLocaleString() : ""}
          </p>
        </Card>
      </div>
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-charcoal dark:text-white">
          Reference scenarios · {version?.name}
        </h3>
        <ScenarioTable scenarios={scenarios} />
      </Card>
    </div>
  );
}

function ScenarioTable({ scenarios }: { scenarios: Scenario[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
            <th className="py-2 pr-3 font-medium">Scenario</th>
            <th className="py-2 pr-3 text-right font-medium">Customer total</th>
            <th className="py-2 pr-3 text-right font-medium">Expected labor</th>
            <th className="py-2 pr-3 text-right font-medium">Scheduled</th>
            <th className="py-2 pr-3 text-right font-medium">Cleaner payout</th>
            <th className="py-2 text-right font-medium">Margin (pre-tax)</th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((s) => (
            <tr key={s.key} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
              <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{s.label}</td>
              {s.error ? (
                <td colSpan={5} className="py-2 text-rose-600">{s.error}</td>
              ) : (
                <>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums text-charcoal dark:text-white">
                    {dollars(s.totalCents)}
                    {s.before && s.before.totalCents !== s.totalCents && (
                      <span className={cn("ml-1 text-xs", (s.totalCents ?? 0) > (s.before.totalCents ?? 0) ? "text-amber-600" : "text-emerald-600")}>
                        (was {dollars(s.before.totalCents)})
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{minutesLabel(s.expectedLaborMinutes)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{minutesLabel(s.scheduledLaborMinutes)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{dollars(s.cleanerPayoutCents)}</td>
                  <td className="py-2 text-right tabular-nums">{dollars(s.marginCents)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MCP proposals (payload → Studio autofill bridge)
// ---------------------------------------------------------------------------

interface Proposal {
  id: string;
  admin_email: string;
  name: string;
  notes: string | null;
  based_on_version_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Lists the LLM-drafted configs sitting in the quarantined MCP sandbox
 * (mcp_simulator_configs). "Load into Studio" imports one as a DRAFT pricing
 * version with every field pre-filled — it then behaves like any other draft:
 * tweak field by field across the tabs, test-quote, and publish (humans only;
 * the MCP itself can never create or publish a pricing version).
 */
function ProposalsTab({
  api,
  onImported,
}: {
  api: ReturnType<typeof useApi>;
  onImported: (versionId: string) => void;
}) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("proposals");
      if (res.ok) {
        const data = (await res.json()) as { proposals: Proposal[] };
        setProposals(data.proposals);
      }
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function importProposal(p: Proposal) {
    setImporting(p.id);
    try {
      const res = await api(`proposals/${p.id}/import`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => null)) as
        | { version?: { id: string }; validation?: { ok: boolean; errors: string[] }; error?: string; message?: string }
        | null;
      if (!res.ok || !data?.version?.id) {
        toast.error(data?.message ?? data?.error ?? "Import failed");
        return;
      }
      if (data.validation && !data.validation.ok) {
        toast.error(
          `Draft created with ${data.validation.errors.length} validation error(s) — fix them before publishing.`,
        );
      } else {
        toast.success("Draft created — every field is now editable in the Studio tabs.");
      }
      onImported(data.version.id);
    } finally {
      setImporting(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-1 text-sm font-semibold text-charcoal dark:text-white">
          MCP sandbox proposals
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Pricing configs drafted through the MCP assistant land here automatically. Loading one
          creates a DRAFT with every field pre-filled and editable across the Studio tabs — nothing
          reaches customers until a human reviews and publishes it. (The paste-a-payload path still
          exists under Pricing → Import Payload.)
        </p>
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading proposals…</p>
        ) : proposals.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No sandbox proposals yet. Ask the pricing assistant (MCP) to store one with
            set_simulator_config — it appears here immediately.
          </p>
        ) : (
          <ul className="space-y-2">
            {proposals.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-sm dark:border-slate-800"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-charcoal dark:text-white">
                    {p.name}
                    <span className="ml-2 text-xs font-normal text-slate-500">{p.admin_email}</span>
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {p.notes ?? "No notes"} · updated {new Date(p.updated_at).toLocaleString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  loading={importing === p.id}
                  disabled={importing !== null && importing !== p.id}
                  onClick={() => void importProposal(p)}
                >
                  <Inbox className="mr-1 h-3.5 w-3.5" /> Load into Studio
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Room labor matrix
// ---------------------------------------------------------------------------

function MatrixTab({
  config,
  patch,
  editable,
  rateCents,
}: {
  config: Config;
  patch: (mut: (c: Config) => Config) => void;
  editable: boolean;
  rateCents: number;
}) {
  const [cell, setCell] = useState<{ type: RoomType; level: number } | null>(null);
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-1 text-sm font-semibold text-charcoal dark:text-white">
          Expected labor minutes per room
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Minutes of active cleaning for ONE room of each type at each condition. Click a cell for
          detail and the customer-price effect. Levels can never decrease left to right.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                <th className="py-2 pr-3 font-medium">Room type</th>
                {LEVEL_LABELS.map((l) => (
                  <th key={l} className="py-2 pr-3 text-right font-medium">{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROOM_TYPES.map((t) => (
                <tr key={t} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="py-2 pr-3 font-medium text-charcoal dark:text-white">{ROOM_LABELS[t]}</td>
                  {[0, 1, 2, 3].map((k) => {
                    const v = config.laborMatrix[t][k];
                    const prev = k > 0 ? config.laborMatrix[t][k - 1] : null;
                    return (
                      <td key={k} className="py-1.5 pr-3 text-right">
                        <button
                          onClick={() => setCell({ type: t, level: k })}
                          className={cn(
                            "rounded-lg px-2.5 py-1.5 tabular-nums transition-colors hover:bg-seafoam-50 dark:hover:bg-slate-800",
                            prev !== null && v < prev && "bg-rose-50 text-rose-700 dark:bg-rose-900/30",
                          )}
                        >
                          <span className="font-medium">{v} min</span>
                          {prev !== null && (
                            <span className="ml-1 text-xs text-slate-400">+{v - prev}</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {cell && (
        <Modal
          open
          onOpenChange={(o) => {
            if (!o) setCell(null);
          }}
          title={`${ROOM_LABELS[cell.type]} — ${LEVEL_LABELS[cell.level]}`}
        >
          <div className="space-y-3 text-sm">
            <NumField
              label="Expected minutes for one room"
              unit="minutes of labor"
              value={config.laborMatrix[cell.type][cell.level]}
              disabled={!editable}
              onChange={(v) =>
                patch((c) => {
                  c.laborMatrix[cell.type][cell.level] = Math.max(0, Math.round(v));
                  return c;
                })
              }
            />
            <p className="text-slate-500">
              Customer price effect at the current rate:{" "}
              <span className="font-medium text-charcoal dark:text-white">
                {dollars(Math.round((config.laborMatrix[cell.type][cell.level] * rateCents) / 60))}
              </span>{" "}
              per room at this condition.
            </p>
            {cell.level > 0 && (
              <p className="text-slate-500">
                Step up from level {cell.level}:{" "}
                <span className="font-medium text-charcoal dark:text-white">
                  +{config.laborMatrix[cell.type][cell.level] - config.laborMatrix[cell.type][cell.level - 1]} min
                </span>
              </p>
            )}
            {!editable && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800">
                Read only — clone this version to a draft to edit.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prediction simulator (+ advanced model settings)
// ---------------------------------------------------------------------------

function PredictionTab({
  api,
  versionId,
  config,
  patch,
  editable,
  canAdvanced,
}: {
  api: ReturnType<typeof useApi>;
  versionId: string | null;
  config: Config;
  patch: (mut: (c: Config) => Config) => void;
  editable: boolean;
  canAdvanced: boolean;
}) {
  const [counts, setCounts] = useState<Record<RoomType, number>>({ kitchen: 1, bathroom: 3, bedroom: 4, living_room: 1 });
  const [levels, setLevels] = useState<Record<RoomType, number>>({ kitchen: 4, bathroom: 4, bedroom: 4, living_room: 4 });
  const [result, setResult] = useState<{
    roomInference: Array<{
      roomType: RoomType;
      count: number;
      reportedMaximumLevel: number;
      guaranteedAtMaximum: number;
      expectedConditionCounts: [number, number, number, number];
      expectedLaborMinutes: number;
      method: string;
      confidence: string;
    }>;
    expectedLaborMinutes: number;
    scheduledLaborMinutes: number;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function simulate() {
    setRunning(true);
    try {
      const res = await api("preview", {
        method: "POST",
        body: JSON.stringify({
          versionId: versionId ?? undefined,
          input: {
            serviceArea: "default",
            currency: "USD",
            counts,
            conditions: levels,
            extras: [],
          },
        }),
      });
      if (!res.ok) {
        toast.error("Simulation failed");
        return;
      }
      const data = (await res.json()) as { result: NonNullable<typeof result> };
      setResult(data.result);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-1 text-sm font-semibold text-charcoal dark:text-white">
          How one answer per room type becomes a whole-home estimate
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          The customer reports each room type's WORST room. This simulator runs the production
          engine to show how that answer spreads across the actual room counts.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ROOM_TYPES.map((t) => (
            <div key={t} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="mb-2 text-sm font-medium text-charcoal dark:text-white">{ROOM_LABELS[t]}</p>
              <div className="flex items-center gap-2 text-sm">
                <label className="text-xs text-slate-500">Rooms</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={counts[t]}
                  onChange={(e) => setCounts({ ...counts, [t]: Math.max(1, Number.parseInt(e.target.value || "1", 10)) })}
                  className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <label className="ml-2 text-xs text-slate-500">Worst level</label>
                <select
                  value={levels[t]}
                  onChange={(e) => setLevels({ ...levels, [t]: Number.parseInt(e.target.value, 10) })}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {[1, 2, 3, 4].map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" loading={running} onClick={() => void simulate()}>
            Run simulation
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setCounts({ kitchen: 1, bathroom: 3, bedroom: 4, living_room: 1 });
              setLevels({ kitchen: 1, bathroom: 4, bedroom: 1, living_room: 1 });
            }}
          >
            Load “only bathrooms heavy” example
          </Button>
        </div>
      </Card>

      {result && (
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-charcoal dark:text-white">Result</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                  <th className="py-2 pr-3 font-medium">Room type</th>
                  <th className="py-2 pr-3 text-right font-medium">Rooms</th>
                  <th className="py-2 pr-3 text-right font-medium">Guaranteed at max</th>
                  <th className="py-2 pr-3 text-right font-medium">Expected count at level 1·2·3·4</th>
                  <th className="py-2 pr-3 text-right font-medium">Minutes</th>
                  <th className="py-2 font-medium">Method</th>
                </tr>
              </thead>
              <tbody>
                {result.roomInference.map((r) => (
                  <tr key={r.roomType} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="py-2 pr-3">{ROOM_LABELS[r.roomType]}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.count}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.guaranteedAtMaximum}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r.expectedConditionCounts.map((c) => c.toFixed(2)).join(" · ")}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.expectedLaborMinutes}m</td>
                    <td className="py-2 text-xs text-slate-500">
                      {r.method.replace("_", " ")} · {r.confidence}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Whole-home expected labor{" "}
            <span className="font-semibold text-charcoal dark:text-white">{minutesLabel(result.expectedLaborMinutes)}</span>
            {" · "}scheduling reserve{" "}
            <span className="font-semibold text-charcoal dark:text-white">{minutesLabel(result.scheduledLaborMinutes)}</span>
          </p>
        </Card>
      )}

      <Card>
        <button
          onClick={() => setShowAdvanced((s) => !s)}
          className="flex items-center gap-2 text-sm font-semibold text-charcoal dark:text-white"
        >
          <Settings2 className="h-4 w-4 text-seafoam-600" />
          Advanced model settings {canAdvanced ? "" : "(view only)"}
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-4">
            <p className="text-xs text-slate-500">
              These shape HOW strongly the rest of the home influences unobserved rooms. Larger
              “whole-home influence” = unobserved rooms follow the home's overall condition more
              closely. Thresholds set how common each level is for an average home; they must
              increase left to right. Ordinary pricing changes never need this panel.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {ROOM_TYPES.map((t) => (
                <div key={t} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="mb-2 text-sm font-medium text-charcoal dark:text-white">{ROOM_LABELS[t]}</p>
                  <div className="flex flex-wrap items-end gap-3">
                    {[0, 1, 2].map((i) => (
                      <NumField
                        key={i}
                        label={`Threshold ≤${i + 1}`}
                        unit=""
                        step={0.1}
                        value={config.inference.thresholds[t][i]}
                        disabled={!editable || !canAdvanced}
                        onChange={(v) =>
                          patch((c) => {
                            c.inference.thresholds[t][i] = v;
                            return c;
                          })
                        }
                      />
                    ))}
                    <NumField
                      label="Whole-home influence"
                      unit=""
                      step={0.1}
                      value={config.inference.betaHome[t]}
                      disabled={!editable || !canAdvanced}
                      onChange={(v) =>
                        patch((c) => {
                          c.inference.betaHome[t] = v;
                          return c;
                        })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Parameters: <span className="font-mono">{config.inference.modelVersion}</span> ·{" "}
              {config.inference.provenance.replace("_", " ")}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clutter & size adjustments
// ---------------------------------------------------------------------------

function AdjustmentsTab({
  config,
  patch,
  editable,
}: {
  config: Config;
  patch: (mut: (c: Config) => Config) => void;
  editable: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <h3 className="mb-1 text-sm font-semibold text-charcoal dark:text-white">Clutter / access minutes</h3>
        <p className="mb-3 text-xs text-slate-500">
          Extra minutes for ONE room at each access state. Never a stand-in for dirtiness — that's
          the labor matrix.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
              <th className="py-2 pr-3 font-medium">Room type</th>
              <th className="py-2 pr-3 text-right font-medium">Clear</th>
              <th className="py-2 pr-3 text-right font-medium">Some items</th>
              <th className="py-2 text-right font-medium">Obstructed</th>
            </tr>
          </thead>
          <tbody>
            {ROOM_TYPES.map((t) => (
              <tr key={t} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="py-2 pr-3 font-medium text-charcoal dark:text-white">{ROOM_LABELS[t]}</td>
                {[0, 1, 2].map((s) => (
                  <td key={s} className="py-1.5 pr-3 text-right">
                    <input
                      type="number"
                      min={0}
                      value={config.clutter.minutesByType[t][s]}
                      disabled={!editable}
                      onChange={(e) =>
                        patch((c) => {
                          c.clutter.minutesByType[t][s] = Math.max(0, Number.parseInt(e.target.value || "0", 10));
                          return c;
                        })
                      }
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm tabular-nums disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800"
                    />
                    <span className="ml-1 text-xs text-slate-400">min</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <NumField
            label="Unobserved rooms charged at"
            unit="% of the reported room's clutter minutes"
            value={config.clutter.unobservedFactorPermille / 10}
            disabled={!editable}
            onChange={(v) =>
              patch((c) => {
                c.clutter.unobservedFactorPermille = Math.max(0, Math.min(1000, Math.round(v * 10)));
                return c;
              })
            }
          />
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={config.clutter.obstructedRequiresReview}
              disabled={!editable}
              onChange={(e) =>
                patch((c) => {
                  c.clutter.obstructedRequiresReview = e.target.checked;
                  return c;
                })
              }
              className="h-4 w-4 rounded border-slate-300 accent-teal-500"
            />
            “Substantially obstructed” requires pre-service review
          </label>
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          <h3 className="mb-1 text-sm font-semibold text-charcoal dark:text-white">Home-size adjustment</h3>
          <p className="mb-3 text-xs text-slate-500">
            Rooms are the base labor model; square footage only adds time OUTSIDE the included
            neutral band (hallways, stairs, open areas the room inventory misses).
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <NumField label="Included square footage" unit="sq ft (no extra time)" value={config.size.includedSqft} disabled={!editable}
              onChange={(v) => patch((c) => { c.size.includedSqft = Math.max(0, Math.round(v)); return c; })} />
            <NumField label="Each additional" unit="sq ft adds…" value={config.size.incrementSqft} disabled={!editable}
              onChange={(v) => patch((c) => { c.size.incrementSqft = Math.max(1, Math.round(v)); return c; })} />
            <NumField label="…this many minutes" unit="minutes" value={config.size.minutesPerIncrement} disabled={!editable}
              onChange={(v) => patch((c) => { c.size.minutesPerIncrement = Math.max(0, Math.round(v)); return c; })} />
            <NumField label="Cap" unit="minutes max" value={config.size.maxAdjustmentMinutes} disabled={!editable}
              onChange={(v) => patch((c) => { c.size.maxAdjustmentMinutes = Math.max(0, Math.round(v)); return c; })} />
          </div>
        </Card>
        <Card>
          <h3 className="mb-1 text-sm font-semibold text-charcoal dark:text-white">Operational minutes</h3>
          <p className="mb-3 text-xs text-slate-500">Fixed non-room time, billed at the labor rate and shown in the explanation.</p>
          <div className="flex flex-wrap items-end gap-4">
            <NumField label="Setup" unit="minutes / visit" value={config.operational.setupMinutes} disabled={!editable}
              onChange={(v) => patch((c) => { c.operational.setupMinutes = Math.max(0, Math.round(v)); return c; })} />
            <NumField label="Pack-down" unit="minutes / visit" value={config.operational.packdownMinutes} disabled={!editable}
              onChange={(v) => patch((c) => { c.operational.packdownMinutes = Math.max(0, Math.round(v)); return c; })} />
            <NumField label="Room transitions" unit="minutes / extra room" value={config.operational.perExtraRoomTransitionMinutes} disabled={!editable}
              onChange={(v) => patch((c) => { c.operational.perExtraRoomTransitionMinutes = Math.max(0, Math.round(v)); return c; })} />
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Extras
// ---------------------------------------------------------------------------

function ExtrasTab({
  config,
  patch,
  editable,
}: {
  config: Config;
  patch: (mut: (c: Config) => Config) => void;
  editable: boolean;
}) {
  return (
    <div className="space-y-4">
    <Card>
      <h3 className="mb-1 text-sm font-semibold text-charcoal dark:text-white">Extras</h3>
      <p className="mb-3 text-xs text-slate-500">
        Minutes bill through the labor rate; fixed amounts add directly. Extras sharing an overlap
        group can't be booked together (prevents double-charging the same work).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
              <th className="py-2 pr-3 font-medium">Extra</th>
              <th className="py-2 pr-3 font-medium">Billing</th>
              <th className="py-2 pr-3 text-right font-medium">Minutes / unit</th>
              <th className="py-2 pr-3 text-right font-medium">Fixed / unit</th>
              <th className="py-2 pr-3 font-medium">Unit</th>
              <th className="py-2 pr-3 text-right font-medium">Max qty</th>
              <th className="py-2 pr-3 font-medium">Overlap group</th>
              <th className="py-2 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {config.extras.map((e, i) => (
              <tr key={e.key} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="py-2 pr-3 font-medium text-charcoal dark:text-white">{e.label}</td>
                <td className="py-2 pr-3">
                  <select
                    value={e.mode}
                    disabled={!editable}
                    onChange={(ev) =>
                      patch((c) => {
                        c.extras[i].mode = ev.target.value as Config["extras"][number]["mode"];
                        return c;
                      })
                    }
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="minutes">minutes</option>
                    <option value="fixed">fixed $</option>
                    <option value="both">both</option>
                  </select>
                </td>
                <td className="py-2 pr-3 text-right">
                  <input
                    type="number" min={0} value={e.minutesPerUnit} disabled={!editable || e.mode === "fixed"}
                    onChange={(ev) => patch((c) => { c.extras[i].minutesPerUnit = Math.max(0, Number.parseInt(ev.target.value || "0", 10)); return c; })}
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm tabular-nums disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800"
                  />
                </td>
                <td className="py-2 pr-3 text-right">
                  <input
                    type="number" min={0} step={0.01} value={e.fixedCentsPerUnit / 100} disabled={!editable || e.mode === "minutes"}
                    onChange={(ev) => patch((c) => { c.extras[i].fixedCentsPerUnit = Math.max(0, Math.round(Number.parseFloat(ev.target.value || "0") * 100)); return c; })}
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm tabular-nums disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800"
                  />
                </td>
                <td className="py-2 pr-3 text-slate-500">{e.unitLabel}</td>
                <td className="py-2 pr-3 text-right">
                  <input
                    type="number" min={1} max={20} value={e.maxQuantity} disabled={!editable}
                    onChange={(ev) => patch((c) => { c.extras[i].maxQuantity = Math.max(1, Number.parseInt(ev.target.value || "1", 10)); return c; })}
                    className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm tabular-nums disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="text" value={e.overlapGroup ?? ""} disabled={!editable} placeholder="—"
                    onChange={(ev) => patch((c) => { c.extras[i].overlapGroup = ev.target.value.trim() || undefined; return c; })}
                    className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800"
                  />
                </td>
                <td className="py-2">
                  <input
                    type="checkbox" checked={e.active} disabled={!editable}
                    onChange={(ev) => patch((c) => { c.extras[i].active = ev.target.checked; return c; })}
                    className="h-4 w-4 rounded border-slate-300 accent-teal-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Rates & payout / Scheduling
// ---------------------------------------------------------------------------

function RatesTab({
  config,
  patch,
  editable,
}: {
  config: Config;
  patch: (mut: (c: Config) => Config) => void;
  editable: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">Customer rates</h3>
        <div className="space-y-4">
          <NumField label="Customer labor rate" unit="per labor-hour" money value={config.rates.customerLaborRateCentsPerHour} disabled={!editable}
            onChange={(v) => patch((c) => { c.rates.customerLaborRateCentsPerHour = Math.max(0, v); return c; })} />
          <NumField label="Fixed service visit" unit="per booking (trip/supplies)" money value={config.rates.fixedServiceCents} disabled={!editable}
            onChange={(v) => patch((c) => { c.rates.fixedServiceCents = Math.max(0, v); return c; })} />
          <NumField label="Minimum job total" unit="floor applied pre-tax · $0 = no minimum" money value={config.rates.minimumBookingCents ?? 0} disabled={!editable}
            help="Supports hourly-rate-plus-minimum pricing (e.g. $25/labor-hour but at least $40 per job). Floors the whole pre-tax subtotal — labor, service visit, extras, area/rush adjustments — before tax and rounding; the test-quote breakdown shows a 'Minimum booking total' line when it kicks in."
            onChange={(v) => patch((c) => { c.rates.minimumBookingCents = Math.max(0, v); return c; })} />
          <NumField label="Automatic quote limit" unit="above this → manual review" money value={config.rates.maxAutoQuoteCents} disabled={!editable}
            onChange={(v) => patch((c) => { c.rates.maxAutoQuoteCents = Math.max(0, v); return c; })} />
          <NumField label="Tax rate" unit="% of the taxable subtotal" step={0.01} value={config.rates.taxRateBps / 100} disabled={!editable}
            onChange={(v) => patch((c) => { c.rates.taxRateBps = Math.max(0, Math.round(v * 100)); return c; })} />
          <NumField label="Short-notice surcharge" unit="% (bookings within 48h)" step={0.5} value={config.rates.emergencySurchargeBps / 100} disabled={!editable}
            onChange={(v) => patch((c) => { c.rates.emergencySurchargeBps = Math.max(0, Math.round(v * 100)); return c; })} />
          <div className="flex items-end gap-3">
            <NumField
              label="Round total up to dollars ending in"
              unit="(charm pricing digit)"
              value={config.rates.roundTotalUpToEndingDigit ?? 9}
              disabled={!editable || config.rates.roundTotalUpToEndingDigit === null}
              onChange={(v) => patch((c) => { c.rates.roundTotalUpToEndingDigit = Math.max(0, Math.min(9, Math.round(v))); return c; })}
            />
            <label className="mb-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={config.rates.roundTotalUpToEndingDigit !== null}
                disabled={!editable}
                onChange={(e) => patch((c) => { c.rates.roundTotalUpToEndingDigit = e.target.checked ? 9 : null; return c; })}
                className="h-4 w-4 rounded border-slate-300 accent-teal-500"
              />
              Enabled
            </label>
          </div>
        </div>
      </Card>
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">Cleaner payout (planning estimate)</h3>
        <p className="mb-3 text-xs text-slate-500">
          Independent of the customer price: changing one never silently changes the other. This is
          a MODELING estimate for margin checks. Actual cleaner pay is the standard 70/30 split: the
          cleaner/team pool earns 70% of captured booking proceeds and the 30% Marketplace Services
          Fee is Sweepr's share (Payouts fee settings), plus 100% of tips to the cleaner outside the
          split. It is not set here and cleaners are never paid hourly.
        </p>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Payout mode</span>
            <select
              value={config.payout.mode}
              disabled={!editable}
              onChange={(e) => patch((c) => { c.payout.mode = e.target.value as Config["payout"]["mode"]; return c; })}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="per_labor_hour">$ per labor-hour worked</option>
              <option value="percent_of_subtotal">% of the labor subtotal</option>
            </select>
          </label>
          {config.payout.mode === "per_labor_hour" ? (
            <NumField label="Cleaner payout" unit="per labor-hour" money value={config.payout.centsPerLaborHour} disabled={!editable}
              onChange={(v) => patch((c) => { c.payout.centsPerLaborHour = Math.max(0, v); return c; })} />
          ) : (
            <NumField label="Cleaner payout" unit="% of labor subtotal" step={0.5} value={config.payout.percentBps / 100} disabled={!editable}
              onChange={(v) => patch((c) => { c.payout.percentBps = Math.max(0, Math.min(10000, Math.round(v * 100))); return c; })} />
          )}
        </div>
      </Card>
    </div>
  );
}

function SchedulingTab({
  config,
  patch,
  editable,
}: {
  config: Config;
  patch: (mut: (c: Config) => Config) => void;
  editable: boolean;
}) {
  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold text-charcoal dark:text-white">Scheduling & capacity</h3>
      <p className="mb-3 text-xs text-slate-500">
        The customer pays for EXPECTED labor. Scheduling reserves more time (the uncertainty
        percentile) so cleaners aren't squeezed — Sweepr absorbs that gap; it is never billed.
      </p>
      <div className="flex flex-wrap items-end gap-5">
        <NumField label="Reserve percentile" unit="th percentile of predicted labor" value={config.scheduling.reservePercentile} disabled={!editable}
          onChange={(v) => patch((c) => { c.scheduling.reservePercentile = Math.max(50, Math.min(99, Math.round(v))); return c; })} />
        <NumField label="Cold-start buffer" unit="% extra scheduled time" step={0.5} value={config.scheduling.bufferRatePermille / 10} disabled={!editable}
          onChange={(v) => patch((c) => { c.scheduling.bufferRatePermille = Math.max(0, Math.round(v * 10)); return c; })} />
        <NumField label="Round scheduled time up to" unit="minutes" value={config.scheduling.roundUpToIncrementMinutes} disabled={!editable}
          onChange={(v) => patch((c) => { c.scheduling.roundUpToIncrementMinutes = Math.max(1, Math.round(v)); return c; })} />
        <NumField label="Two-person team above" unit="scheduled minutes" value={config.scheduling.twoPersonThresholdMinutes} disabled={!editable}
          onChange={(v) => patch((c) => { c.scheduling.twoPersonThresholdMinutes = Math.max(0, Math.round(v)); return c; })} />
        <NumField label="Two-person productivity" unit="× one cleaner (e.g. 1.8)" step={0.05} value={(config.scheduling.teamProductivityPermille["2"] ?? 1800) / 1000} disabled={!editable}
          onChange={(v) => patch((c) => { c.scheduling.teamProductivityPermille["2"] = Math.max(500, Math.round(v * 1000)); return c; })} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Test quote (production engine, non-persisting)
// ---------------------------------------------------------------------------

function TestQuoteTab({ api, versionId }: { api: ReturnType<typeof useApi>; versionId: string | null }) {
  const [counts, setCounts] = useState<Record<RoomType, number>>({ kitchen: 1, bathroom: 2, bedroom: 3, living_room: 1 });
  const [levels, setLevels] = useState<Record<RoomType, number>>({ kitchen: 2, bathroom: 2, bedroom: 2, living_room: 2 });
  const [clutter, setClutter] = useState<Record<RoomType, number>>({ kitchen: 0, bathroom: 0, bedroom: 0, living_room: 0 });
  const [sqft, setSqft] = useState(1600);
  const [emergency, setEmergency] = useState(false);
  const [result, setResult] = useState<{
    components: Array<{ code: string; label: string; laborMinutes: number; amountCents: number }>;
    totalCents: number;
    taxCents: number;
    subtotalCents: number;
    cleanerPayoutCents: number;
    expectedLaborMinutes: number;
    scheduledLaborMinutes: number;
    estimatedElapsedMinutes: number;
    recommendedTeamSize: number;
    warnings: string[];
    manualReviewRequired: boolean;
    minimumApplied?: boolean;
  } | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await api("preview", {
        method: "POST",
        body: JSON.stringify({
          versionId: versionId ?? undefined,
          input: {
            serviceArea: "default",
            currency: "USD",
            counts,
            conditions: levels,
            clutter: Object.fromEntries(Object.entries(clutter).filter(([, v]) => v > 0)),
            sqft,
            extras: [],
            emergency,
          },
        }),
      });
      const data = (await res.json().catch(() => null)) as { result?: NonNullable<typeof result>; message?: string } | null;
      if (!res.ok || !data?.result) {
        toast.error(data?.message ?? "Preview failed");
        return;
      }
      setResult(data.result);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">Build a test quote</h3>
        <div className="space-y-3">
          {ROOM_TYPES.map((t) => (
            <div key={t} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-36 text-slate-600 dark:text-slate-300">{ROOM_LABELS[t]}</span>
              <input type="number" min={1} max={10} value={counts[t]}
                onChange={(e) => setCounts({ ...counts, [t]: Math.max(1, Number.parseInt(e.target.value || "1", 10)) })}
                className="w-16 rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              <select value={levels[t]} onChange={(e) => setLevels({ ...levels, [t]: Number.parseInt(e.target.value, 10) })}
                className="rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                {[1, 2, 3, 4].map((l) => <option key={l} value={l}>Level {l}</option>)}
              </select>
              <select value={clutter[t]} onChange={(e) => setClutter({ ...clutter, [t]: Number.parseInt(e.target.value, 10) })}
                className="rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                <option value={0}>Clear</option>
                <option value={1}>Some items</option>
                <option value={2}>Obstructed</option>
              </select>
            </div>
          ))}
          <div className="flex items-center gap-4">
            <label className="text-sm text-slate-600 dark:text-slate-300">
              Sq ft{" "}
              <input type="number" min={100} value={sqft} onChange={(e) => setSqft(Number.parseInt(e.target.value || "0", 10))}
                className="ml-1 w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-teal-500" />
              Within 48h (rush)
            </label>
          </div>
          <Button size="sm" loading={running} onClick={() => void run()}>
            <FlaskConical className="mr-1 h-3.5 w-3.5" /> Price it
          </Button>
        </div>
      </Card>
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">Explanation</h3>
        {!result ? (
          <p className="py-8 text-center text-sm text-slate-500">Run a test quote to see the full component breakdown.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {result.components.map((comp, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3">
                <span className="text-slate-600 dark:text-slate-300">{comp.label}</span>
                <span className="whitespace-nowrap tabular-nums text-slate-500">
                  {comp.laborMinutes > 0 ? `${comp.laborMinutes}m` : ""}
                  {comp.laborMinutes > 0 && comp.amountCents !== 0 ? " · " : ""}
                  {comp.amountCents !== 0 ? dollars(comp.amountCents) : ""}
                </span>
              </div>
            ))}
            <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">
              <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{dollars(result.subtotalCents)}</span></div>
              <div className="flex justify-between"><span>Tax</span><span className="tabular-nums">{dollars(result.taxCents)}</span></div>
              <div className="flex justify-between font-semibold text-charcoal dark:text-white">
                <span>Customer total</span><span className="tabular-nums">{dollars(result.totalCents)}</span>
              </div>
              <div className="mt-1 flex justify-between text-slate-500">
                <span title="Planning estimate from this config's payout model. Actual cleaner pay is 70% of captured proceeds (the 30% Marketplace Services Fee is Sweepr's share), plus 100% of tips.">
                  Modeled cleaner payout (est.)
                </span>
                <span className="tabular-nums">{dollars(result.cleanerPayoutCents)}</span>
              </div>
              {result.minimumApplied && (
                <p className="mt-1 rounded-lg bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                  Minimum applied — this job priced below the configured minimum and was topped up
                  to it (see the “Minimum booking total” line above).
                </p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                {minutesLabel(result.expectedLaborMinutes)} expected · {minutesLabel(result.scheduledLaborMinutes)} scheduled ·{" "}
                ~{minutesLabel(result.estimatedElapsedMinutes)} on site · team of {result.recommendedTeamSize}
              </p>
              {result.warnings.map((w) => (
                <p key={w} className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{w}</p>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review & publish / History
// ---------------------------------------------------------------------------

function PublishTab({
  api,
  version,
  canPublish,
  onPublished,
}: {
  api: ReturnType<typeof useApi>;
  version: Version | null;
  canPublish: boolean;
  onPublished: () => void;
}) {
  const [impact, setImpact] = useState<{
    warnings: string[];
    validation: { ok: boolean; errors: string[]; warnings: string[] };
    scenarios: Scenario[];
    active: Version | null;
  } | null>(null);
  const [summary, setSummary] = useState("");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    if (!version || version.status !== "draft") {
      setImpact(null);
      return;
    }
    const res = await api(`versions/${version.id}/impact`);
    if (res.ok) setImpact((await res.json()) as NonNullable<typeof impact>);
  }, [api, version]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!version) return null;
  if (version.status !== "draft") {
    return (
      <Card>
        <p className="py-8 text-center text-sm text-slate-500">
          Only drafts can be published. {version.status === "active" ? "This version is already live." : "Select or create a draft."}
        </p>
      </Card>
    );
  }

  async function publish() {
    if (summary.trim().length < 5) {
      toast.error("A change summary is required before publishing.");
      return;
    }
    if (
      !window.confirm(
        effectiveAt
          ? `Schedule “${version!.name}” for ${new Date(effectiveAt).toLocaleString()}? Customers are unaffected until then.`
          : `Publish “${version!.name}” NOW? New quotes and bookings will use it immediately. Existing bookings keep their original price.`,
      )
    ) {
      return;
    }
    setPublishing(true);
    try {
      const res = await api(`versions/${version!.id}/publish`, {
        method: "POST",
        body: JSON.stringify({
          changeSummary: summary.trim(),
          effectiveAt: effectiveAt ? new Date(effectiveAt).toISOString() : undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; message?: string; validation?: { errors: string[] } } | null;
      if (!res.ok) {
        toast.error(data?.validation?.errors?.[0] ?? data?.message ?? data?.error ?? "Publish failed");
        return;
      }
      toast.success(effectiveAt ? "Scheduled." : "Published — new quotes use this version (live within a minute).");
      onPublished();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-4">
      {impact && (
        <>
          {!impact.validation.ok && (
            <Card className="border-rose-300 dark:border-rose-800">
              <h3 className="mb-2 text-sm font-semibold text-rose-700 dark:text-rose-300">Fix before publishing</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-rose-700 dark:text-rose-300">
                {impact.validation.errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </Card>
          )}
          {impact.warnings.length > 0 && (
            <Card className="border-amber-300 dark:border-amber-800">
              <h3 className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-300">Large changes — double-check</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-300">
                {impact.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </Card>
          )}
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-charcoal dark:text-white">
              Reference scenarios — draft vs {impact.active ? `active (“${impact.active.name}”)` : "no active version"}
            </h3>
            <ScenarioTable scenarios={impact.scenarios} />
          </Card>
        </>
      )}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">Publish</h3>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Change summary (required)</span>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            placeholder="What changed and why — shows in version history."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Effective time (leave empty = immediately) — your local time, stored as UTC
            </span>
            <input
              type="datetime-local"
              value={effectiveAt}
              onChange={(e) => setEffectiveAt(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </label>
          <Button
            loading={publishing}
            disabled={!canPublish || (impact ? !impact.validation.ok : false)}
            onClick={() => void publish()}
          >
            <Rocket className="mr-1 h-4 w-4" />
            {effectiveAt ? "Schedule" : "Publish now"}
          </Button>
          {!canPublish && (
            <p className="text-xs text-slate-500">You don't have the publish permission (content.pricing.publish).</p>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Publishing never changes accepted bookings — every booking keeps the exact quote it was
          created with. Rollback = clone an earlier version and publish it.
        </p>
      </Card>
    </div>
  );
}

function HistoryTab({
  api,
  versions,
  onClone,
  onChanged,
}: {
  api: ReturnType<typeof useApi>;
  versions: Version[];
  onClone: (id: string) => void;
  onChanged: () => void;
}) {
  const [audit, setAudit] = useState<Array<{ id: string; version_id: string | null; actor_clerk_id: string | null; event: string; detail: Record<string, unknown>; created_at: string }>>([]);

  useEffect(() => {
    void (async () => {
      const res = await api("audit");
      if (res.ok) setAudit(((await res.json()) as { events: typeof audit }).events);
    })();
  }, [api]);

  async function archive(v: Version) {
    if (
      !window.confirm(
        v.status === "active"
          ? `Archive the ACTIVE version “${v.name}”? Pricing v2 turns OFF and bookings fall back to the legacy engine until another version is published.`
          : `Archive “${v.name}”?`,
      )
    ) {
      return;
    }
    const res = await api(`versions/${v.id}/archive`, { method: "POST" });
    if (res.ok) {
      toast.success("Archived");
      onChanged();
    } else toast.error("Archive failed");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-charcoal dark:text-white">Versions</h3>
        <ul className="space-y-2">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
              <div className="min-w-0">
                <p className="truncate font-medium text-charcoal dark:text-white">
                  {v.name}{" "}
                  <span
                    className={cn(
                      "ml-1 rounded-full px-2 py-0.5 text-xs font-medium",
                      v.status === "active" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
                      v.status === "draft" && "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
                      v.status === "scheduled" && "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                      (v.status === "superseded" || v.status === "archived") && "bg-slate-100 text-slate-500 dark:bg-slate-800",
                    )}
                  >
                    {v.status}
                  </span>
                </p>
                <p className="truncate text-xs text-slate-500">
                  {v.change_summary ?? "—"} · {new Date(v.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => onClone(v.id)} title="Clone to draft (rollback path)"
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-seafoam-700 dark:hover:bg-slate-800">
                  <Copy className="h-4 w-4" />
                </button>
                {(v.status === "draft" || v.status === "scheduled" || v.status === "active") && (
                  <button onClick={() => void archive(v)} title="Archive"
                    className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30">
                    <Archive className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-charcoal dark:text-white">
          <ClipboardCheck className="h-4 w-4 text-seafoam-600" /> Audit log
        </h3>
        <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto text-sm">
          {audit.map((e) => (
            <li key={e.id} className="flex items-baseline justify-between gap-3">
              <span className="text-slate-600 dark:text-slate-300">
                <span className="font-medium">{e.event.replace(/_/g, " ")}</span>
                {e.actor_clerk_id ? <span className="text-slate-400"> · {e.actor_clerk_id.slice(0, 18)}</span> : null}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-slate-400">{new Date(e.created_at).toLocaleString()}</span>
            </li>
          ))}
          {audit.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No events yet.</p>}
        </ul>
      </Card>
    </div>
  );
}
