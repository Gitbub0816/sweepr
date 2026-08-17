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
 * Site Analytics — first-party web analytics dashboard (separate from
 * Observability's product/API telemetry). Reads /admin/site-analytics/*;
 * data is written by the sweepr-analytics worker. Includes the tracking-link
 * manager for https://getsweepr.com/go/{code} short links.
 *
 * This route is lazy-loaded (App.tsx) because of the three.js dependency.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  Activity,
  BarChart3,
  Copy,
  Eye,
  Globe2,
  Link2,
  MousePointerClick,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Timer,
  Trash2,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button, Card, Modal, StatCard, toast } from "@sweepr/ui";
import { cn } from "@sweepr/utils";
import { TrafficBars, VisitorGlobe, type CityPoint, type DayBar } from "../components/analytics/ThreeScenes";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

// Chart series colors — validated (dataviz six-checks) against the light
// (#f9f8f6) and dark (#1c1a17) surfaces. Amber carries direct value labels
// (tooltip + legend) as its contrast relief in light mode.
const SERIES = {
  light: { sessions: "#0d9488", pageviews: "#f59e0b", grid: "#e7e5e2", text: "#78726b" },
  dark: { sessions: "#0d9488", pageviews: "#d97706", grid: "#44403b", text: "#a8a39c" },
};

// ---------------------------------------------------------------------------
// Data plumbing
// ---------------------------------------------------------------------------

function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function useSiteData<T>(path: string, query: Record<string, string | number | undefined> = {}) {
  const { getToken } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(query);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") params.set(k, String(v));
      }
      const qs = params.toString();
      const res = await fetch(`${API}/admin/site-analytics/${path}${qs ? `?${qs}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData((await res.json()) as T);
    } catch {
      /* panel renders its empty state */
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, reload };
}

async function authedFetch(
  getToken: () => Promise<string | null>,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getToken();
  return fetch(`${API}/admin/site-analytics/${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const RANGES = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function fmtDuration(s: number | null | undefined): string {
  if (!s || s <= 0) return "0s";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface BreakdownRow {
  key: string | null;
  sessions: number;
  visitors?: number;
  country?: string;
  count?: number;
}

/** Horizontal magnitude list: single-hue bars, values as text (never color-only). */
function BarList({ title, rows, icon: Icon, unit = "sessions" }: {
  title: string;
  rows: BreakdownRow[] | undefined;
  icon?: typeof Globe2;
  unit?: string;
}) {
  const max = Math.max(1, ...(rows ?? []).map((r) => r.sessions ?? r.count ?? 0));
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-seafoam-600" />}
        <h3 className="text-sm font-semibold text-charcoal dark:text-white">{title}</h3>
      </div>
      {!rows || rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No data in this range yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const value = r.sessions ?? r.count ?? 0;
            return (
              <li key={`${r.key}-${i}`} className="text-sm">
                <div className="mb-0.5 flex items-baseline justify-between gap-3">
                  <span className="truncate text-slate-600 dark:text-slate-300">
                    {r.key ?? "unknown"}
                    {r.country ? <span className="text-slate-400"> · {r.country}</span> : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {value.toLocaleString()} <span className="text-xs">{unit}</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-seafoam-500"
                    style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

interface Overview {
  days: number;
  granularity: "hour" | "day";
  totals: {
    sessions?: number;
    visitors?: number;
    pageviews?: number;
    clicks?: number;
    bounces?: number;
    avg_session_seconds?: number;
  };
  live: number;
  series: Array<{ bucket: string; sessions: number; visitors: number; pageviews: number }>;
}

interface Breakdowns {
  device: BreakdownRow[];
  browser: BreakdownRow[];
  os: BreakdownRow[];
  country: BreakdownRow[];
  city: BreakdownRow[];
  source: BreakdownRow[];
  campaign: BreakdownRow[];
  link: BreakdownRow[];
  language: BreakdownRow[];
  custom: BreakdownRow[];
}

interface GeoData {
  countries: BreakdownRow[];
  cities: Array<{ city: string; region: string | null; country: string | null; sessions: number; lat: number; lon: number }>;
}

interface PagesData {
  pages: Array<{ app: string; path: string; views: number; sessions: number; visitors: number }>;
  clicks: Array<{ text: string; href: string | null; clicks: number }>;
}

function OverviewTab({ days }: { days: number }) {
  const dark = useDarkMode();
  const { data: overview, loading } = useSiteData<Overview>("overview", { days });
  const { data: breakdowns } = useSiteData<Breakdowns>("breakdowns", { days });
  const { data: geo } = useSiteData<GeoData>("geo", { days });
  const { data: pages } = useSiteData<PagesData>("pages", { days });

  const t = overview?.totals ?? {};
  const sessions = t.sessions ?? 0;
  const bounceRate = sessions > 0 ? Math.round(((t.bounces ?? 0) / sessions) * 100) : 0;
  const colors = dark ? SERIES.dark : SERIES.light;

  const cities: CityPoint[] = useMemo(
    () =>
      (geo?.cities ?? []).map((c) => ({
        city: c.city,
        region: c.region,
        country: c.country,
        sessions: c.sessions,
        lat: c.lat,
        lon: c.lon,
      })),
    [geo],
  );
  const dayBars: DayBar[] = useMemo(
    () => (overview?.series ?? []).map((s) => ({ bucket: s.bucket, sessions: s.sessions, pageviews: s.pageviews })),
    [overview],
  );
  const chartData = useMemo(
    () =>
      (overview?.series ?? []).map((s) => ({
        ...s,
        label:
          overview?.granularity === "hour"
            ? new Date(s.bucket).toLocaleTimeString(undefined, { hour: "numeric" })
            : new Date(s.bucket).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      })),
    [overview],
  );

  return (
    <div className="space-y-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Page views" value="0" countTo={t.pageviews ?? 0} icon={Eye} />
        <StatCard label="Visitors" value="0" countTo={t.visitors ?? 0} icon={Users} />
        <StatCard label="Sessions" value="0" countTo={sessions} icon={Activity} />
        <StatCard label="Clicks" value="0" countTo={t.clicks ?? 0} icon={MousePointerClick} />
        <StatCard label="Avg session" value={fmtDuration(t.avg_session_seconds)} icon={Timer} />
        <StatCard label="Live now" value="0" countTo={overview?.live ?? 0} icon={Radio} delta={`${bounceRate}% bounce`} />
      </div>

      {/* 3D band */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="mb-1 flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-seafoam-600" />
            <h3 className="text-sm font-semibold text-charcoal dark:text-white">Where visitors are</h3>
          </div>
          <p className="text-xs text-slate-500">One dot per city, sized by sessions. Drag to spin.</p>
          {cities.length === 0 && !loading ? (
            <p className="py-24 text-center text-sm text-slate-500">
              No geo data in this range yet — the globe fills in as visitors arrive.
            </p>
          ) : (
            <VisitorGlobe cities={cities} dark={dark} />
          )}
        </Card>
        <Card className="overflow-hidden">
          <div className="mb-1 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-seafoam-600" />
            <h3 className="text-sm font-semibold text-charcoal dark:text-white">
              {overview?.granularity === "hour" ? "Sessions by hour" : "Sessions by day"}
            </h3>
          </div>
          <p className="text-xs text-slate-500">Column height = sessions. Hover for exact counts.</p>
          {dayBars.length === 0 && !loading ? (
            <p className="py-24 text-center text-sm text-slate-500">No traffic recorded in this range yet.</p>
          ) : (
            <TrafficBars series={dayBars} dark={dark} />
          )}
        </Card>
      </div>

      {/* 2D timeseries — same numbers, precise axes */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">Traffic over time</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.text }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: colors.text }} tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip
                contentStyle={{
                  background: dark ? "#2a2622" : "#ffffff",
                  border: `1px solid ${colors.grid}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="pageviews"
                name="Page views"
                stroke={colors.pageviews}
                fill={colors.pageviews}
                fillOpacity={0.12}
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="sessions"
                name="Sessions"
                stroke={colors.sessions}
                fill={colors.sessions}
                fillOpacity={0.16}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Breakdowns */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <BarList title="Devices" rows={breakdowns?.device} />
        <BarList title="Operating systems" rows={breakdowns?.os} />
        <BarList title="Browsers" rows={breakdowns?.browser} />
        <BarList title="Countries" rows={breakdowns?.country} />
        <BarList title="Cities" rows={breakdowns?.city} />
        <BarList title="Languages" rows={breakdowns?.language} />
      </div>

      {/* Pages + clicks */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">Top pages</h3>
          {!pages || pages.pages.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No page views in this range yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                    <th className="py-2 pr-3 font-medium">Page</th>
                    <th className="py-2 pr-3 font-medium">App</th>
                    <th className="py-2 pr-3 text-right font-medium">Views</th>
                    <th className="py-2 text-right font-medium">Visitors</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.pages.slice(0, 15).map((p, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="max-w-[16rem] truncate py-2 pr-3 font-mono text-xs text-charcoal dark:text-white">{p.path}</td>
                      <td className="py-2 pr-3 text-slate-500">{p.app}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.views.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums">{p.visitors.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">Top clicks</h3>
          {!pages || pages.clicks.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No clicks in this range yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {pages.clicks.slice(0, 15).map((cl, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-slate-600 dark:text-slate-300" title={cl.href ?? undefined}>
                    {cl.text}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-500">{cl.clicks.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Conversions / custom events, when apps emit them */}
      {breakdowns && breakdowns.custom.length > 0 && (
        <BarList title="Custom events" rows={breakdowns.custom} unit="times" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sources & Links tab
// ---------------------------------------------------------------------------

interface TrackingLink {
  id: string;
  code: string;
  label: string;
  source: string;
  campaign_id: string | null;
  destination: string;
  notes: string | null;
  active: boolean;
  hit_count: number;
  last_hit_at: string | null;
}

interface LinkStats {
  stats: Array<{ code: string; hits: number; sessions: number; pageviews: number }>;
}

const SOURCE_PRESETS = ["google", "chatgpt", "facebook", "instagram", "nextdoor", "x", "tiktok", "yelp", "youtube", "email", "sms", "qr", "print"];

const EMPTY_FORM = { label: "", source: "", campaignId: "", destination: "/", code: "", notes: "" };

function LinksTab({ days }: { days: number }) {
  const { getToken } = useAuth();
  const { data: linksData, reload } = useSiteData<{ links: TrackingLink[] }>("links");
  const { data: statsData, reload: reloadStats } = useSiteData<LinkStats>("links/stats", { days });
  const { data: breakdowns } = useSiteData<Breakdowns>("breakdowns", { days });
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<TrackingLink | null>(null);

  const stats = useMemo(() => {
    const map = new Map<string, { hits: number; sessions: number; pageviews: number }>();
    for (const s of statsData?.stats ?? []) map.set(s.code, s);
    return map;
  }, [statsData]);

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function createLink() {
    if (!form.label.trim() || !form.source.trim()) {
      toast.error("A label and a source are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await authedFetch(getToken, "links", {
        method: "POST",
        body: JSON.stringify({
          label: form.label.trim(),
          source: form.source.trim(),
          campaignId: form.campaignId.trim() || null,
          destination: form.destination.trim() || "/",
          code: form.code.trim() || undefined,
          notes: form.notes.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok) {
        toast.error(body?.error ?? "Could not create the link.");
        return;
      }
      setForm(EMPTY_FORM);
      await reload();
      await reloadStats();
      if (body?.url) {
        await navigator.clipboard.writeText(body.url).catch(() => undefined);
        toast.success(`Link created — ${body.url} copied to clipboard`);
      } else {
        toast.success("Link created");
      }
    } finally {
      setSaving(false);
    }
  }

  async function patchLink(id: string, patch: Record<string, unknown>, message: string) {
    const res = await authedFetch(getToken, `links/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (res.ok) {
      toast.success(message);
      await reload();
    } else {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(body?.error ?? "Update failed.");
    }
  }

  async function deleteLink(link: TrackingLink) {
    if (!window.confirm(`Delete /go/${link.code}? The public URL stops working immediately.`)) return;
    const res = await authedFetch(getToken, `links/${link.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Link deleted");
      await reload();
    } else {
      toast.error("Delete failed.");
    }
  }

  function copyUrl(code: string) {
    void navigator.clipboard
      .writeText(`https://getsweepr.com/go/${code}`)
      .then(() => toast.success("Copied"))
      .catch(() => toast.error("Could not copy"));
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

  return (
    <div className="space-y-6">
      {/* Create */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-seafoam-600" />
          <h3 className="text-sm font-semibold text-charcoal dark:text-white">Create a tracking link</h3>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Share <span className="font-mono">getsweepr.com/go/&#123;code&#125;</span> in ads, posts, or QR codes. Visits
          are attributed to the source (and optional campaign ID) and followed through the whole session.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Label *</label>
            <input className={inputCls} value={form.label} onChange={set("label")} placeholder="Nextdoor spring push" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Source *</label>
            <input className={inputCls} value={form.source} onChange={set("source")} list="source-presets" placeholder="nextdoor" />
            <datalist id="source-presets">
              {SOURCE_PRESETS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Campaign ID (optional)</label>
            <input className={inputCls} value={form.campaignId} onChange={set("campaignId")} placeholder="spring26-coupon" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Destination</label>
            <input className={inputCls} value={form.destination} onChange={set("destination")} placeholder="/ or /pricing or https://clean.getsweepr.com/apply" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Custom code (optional)</label>
            <input className={inputCls} value={form.code} onChange={set("code")} placeholder="auto-generated from label" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Notes (optional)</label>
            <input className={inputCls} value={form.notes} onChange={set("notes")} placeholder="Ran in the April mailer" />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={createLink} loading={saving}>
            Create link
          </Button>
        </div>
      </Card>

      {/* Links table */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-seafoam-600" />
          <h3 className="text-sm font-semibold text-charcoal dark:text-white">Tracking links</h3>
        </div>
        {!linksData || linksData.links.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No links yet — create the first one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                  <th className="py-2 pr-3 font-medium">Link</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Campaign</th>
                  <th className="py-2 pr-3 font-medium">Destination</th>
                  <th className="py-2 pr-3 text-right font-medium">Hits (all)</th>
                  <th className="py-2 pr-3 text-right font-medium">Hits ({days}d)</th>
                  <th className="py-2 pr-3 text-right font-medium">Sessions ({days}d)</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {linksData.links.map((l) => {
                  const s = stats.get(l.code);
                  return (
                    <tr key={l.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-charcoal dark:text-white">/go/{l.code}</span>
                          <button
                            onClick={() => copyUrl(l.code)}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-seafoam-700 dark:hover:bg-slate-800"
                            title="Copy full URL"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-500">{l.label}</p>
                      </td>
                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{l.source}</td>
                      <td className="py-2 pr-3 text-slate-500">{l.campaign_id ?? "—"}</td>
                      <td className="max-w-[12rem] truncate py-2 pr-3 font-mono text-xs text-slate-500" title={l.destination}>
                        {l.destination.replace("https://getsweepr.com", "")}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{l.hit_count.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{(s?.hits ?? 0).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{(s?.sessions ?? 0).toLocaleString()}</td>
                      <td className="py-2">
                        <button
                          onClick={() => patchLink(l.id, { active: !l.active }, l.active ? "Link paused" : "Link activated")}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            l.active
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-800",
                          )}
                        >
                          {l.active ? "Active" : "Paused"}
                        </button>
                      </td>
                      <td className="py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setEditing(l)}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-seafoam-700 dark:hover:bg-slate-800"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteLink(l)}
                            className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Source performance */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <BarList title="Sessions by source" rows={breakdowns?.source} />
        <BarList title="Sessions by campaign" rows={breakdowns?.campaign} />
        <BarList title="Sessions by link" rows={breakdowns?.link} />
      </div>

      {editing && (
        <EditLinkModal
          link={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await patchLink(editing.id, patch, "Link updated");
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditLinkModal({
  link,
  onClose,
  onSave,
}: {
  link: TrackingLink;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    label: link.label,
    source: link.source,
    campaignId: link.campaign_id ?? "",
    destination: link.destination,
    notes: link.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white";
  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose(); }} title={`Edit /go/${link.code}`}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          The code itself can't change (printed QR codes and live ads must keep working) — create a new link for a new code.
        </p>
        {(
          [
            ["label", "Label"],
            ["source", "Source"],
            ["campaignId", "Campaign ID"],
            ["destination", "Destination"],
            ["notes", "Notes"],
          ] as const
        ).map(([k, label]) => (
          <div key={k}>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</label>
            <input
              className={inputCls}
              value={form[k]}
              onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
            />
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  label: form.label.trim(),
                  source: form.source.trim(),
                  campaignId: form.campaignId.trim() || null,
                  destination: form.destination.trim(),
                  notes: form.notes.trim() || null,
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Sessions tab (individualized journeys)
// ---------------------------------------------------------------------------

interface SessionRow {
  session_id: string;
  visitor_id: string;
  app: string | null;
  entry_path: string | null;
  exit_path: string | null;
  source: string | null;
  campaign_id: string | null;
  link_code: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  pageviews: number;
  clicks: number;
  events: number;
  first_seen_at: string;
  last_seen_at: string;
  duration_seconds: number;
}

interface SessionDetail {
  session: SessionRow & Record<string, unknown>;
  events: Array<{
    occurred_at: string;
    app: string;
    event_type: string;
    path: string | null;
    click_text: string | null;
    click_href: string | null;
    browser: string | null;
    os: string | null;
    timezone: string | null;
    asn_org: string | null;
    ipinfo: Record<string, unknown> | null;
    meta: Record<string, unknown>;
  }>;
}

function SessionsTab({ days }: { days: number }) {
  const { getToken } = useAuth();
  const [filters, setFilters] = useState({ source: "", device: "", country: "" });
  const [applied, setApplied] = useState(filters);
  const { data, loading, reload } = useSiteData<{ sessions: SessionRow[] }>("sessions", {
    days,
    source: applied.source || undefined,
    device: applied.device || undefined,
    country: applied.country || undefined,
  });
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  async function openSession(id: string) {
    const res = await authedFetch(getToken, `sessions/${encodeURIComponent(id)}`);
    if (res.ok) setDetail((await res.json()) as SessionDetail);
    else toast.error("Could not load that session.");
  }

  const inputCls =
    "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Source</label>
            <input
              className={inputCls}
              value={filters.source}
              onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}
              placeholder="google"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Device</label>
            <select
              className={inputCls}
              value={filters.device}
              onChange={(e) => setFilters((f) => ({ ...f, device: e.target.value }))}
            >
              <option value="">Any</option>
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
              <option value="tablet">Tablet</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Country</label>
            <input
              className={inputCls}
              value={filters.country}
              onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value.toUpperCase().slice(0, 2) }))}
              placeholder="US"
            />
          </div>
          <Button variant="secondary" onClick={() => setApplied({ ...filters })}>
            Apply
          </Button>
          <button
            onClick={() => void reload()}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </button>
        </div>
      </Card>

      <Card>
        {!data || data.sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No sessions match — data appears here as visitors browse the sites.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Journey</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Device</th>
                  <th className="py-2 pr-3 font-medium">Location</th>
                  <th className="py-2 pr-3 text-right font-medium">Views</th>
                  <th className="py-2 text-right font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr
                    key={s.session_id}
                    onClick={() => void openSession(s.session_id)}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{fmtWhen(s.first_seen_at)}</td>
                    <td className="max-w-[14rem] truncate py-2 pr-3 font-mono text-xs text-charcoal dark:text-white">
                      {s.entry_path ?? "?"}
                      {s.exit_path && s.exit_path !== s.entry_path ? ` → ${s.exit_path}` : ""}
                    </td>
                    <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                      {s.source ?? "direct"}
                      {s.link_code ? <span className="text-slate-400"> · /go/{s.link_code}</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-slate-500">
                      {[s.device_type, s.browser, s.os].filter(Boolean).join(" · ")}
                    </td>
                    <td className="py-2 pr-3 text-slate-500">
                      {[s.city, s.region, s.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{s.pageviews}</td>
                    <td className="py-2 text-right tabular-nums">{fmtDuration(s.duration_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detail && <SessionModal detail={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function SessionModal({ detail, onClose }: { detail: SessionDetail; onClose: () => void }) {
  const s = detail.session;
  const privacy = detail.events.find((e) => e.ipinfo)?.ipinfo as
    | { privacy?: { vpn?: boolean; proxy?: boolean; hosting?: boolean }; org?: string; company?: string }
    | undefined;
  const facts: Array<[string, string]> = [
    ["Source", [s.source ?? "direct", s.campaign_id, s.link_code ? `/go/${s.link_code}` : null].filter(Boolean).join(" · ")],
    ["Device", [s.device_type, s.browser, s.os].filter(Boolean).join(" · ") || "—"],
    ["Location", [s.city, s.region, s.country].filter(Boolean).join(", ") || "—"],
    ["Duration", fmtDuration(s.duration_seconds)],
    ["Visitor", s.visitor_id.slice(0, 16) + "…"],
  ];
  if (privacy?.org || privacy?.company) facts.push(["Network", String(privacy.company ?? privacy.org)]);
  if (privacy?.privacy && (privacy.privacy.vpn || privacy.privacy.proxy || privacy.privacy.hosting)) {
    facts.push([
      "Privacy flags",
      [privacy.privacy.vpn && "VPN", privacy.privacy.proxy && "proxy", privacy.privacy.hosting && "hosting"]
        .filter(Boolean)
        .join(", "),
    ]);
  }
  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose(); }} title={`Session · ${fmtWhen(s.first_seen_at)}`}>
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt>
              <dd className="text-charcoal dark:text-white">{v}</dd>
            </div>
          ))}
        </dl>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Journey</h4>
          <ol className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {detail.events.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span
                  className={cn(
                    "mt-1 h-2 w-2 shrink-0 rounded-full",
                    e.event_type === "pageview" && "bg-seafoam-500",
                    e.event_type === "click" && "bg-amberaccent",
                    e.event_type === "link_hit" && "bg-violet-500",
                    e.event_type === "custom" && "bg-sky-500",
                  )}
                />
                <span className="whitespace-nowrap tabular-nums text-xs text-slate-400">
                  {new Date(e.occurred_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
                  {e.event_type === "pageview" && <span className="font-mono text-xs">{e.path}</span>}
                  {e.event_type === "click" && (
                    <>
                      clicked <span className="font-medium">{e.click_text ?? e.click_href ?? "element"}</span>
                    </>
                  )}
                  {e.event_type === "link_hit" && <>arrived via tracking link</>}
                  {e.event_type === "custom" && <>event: {String(e.meta?.name ?? "custom")}</>}
                  <span className="text-slate-400"> · {e.app}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

type Tab = "overview" | "links" | "sessions";
const TABS: Array<{ id: Tab; label: string; icon: typeof Eye }> = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "links", label: "Sources & Links", icon: Link2 },
  { id: "sessions", label: "Sessions", icon: Users },
];

export function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = (searchParams.get("tab") as Tab | null) ?? "overview";
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === initial) ? initial : "overview");
  const [days, setDays] = useState(30);

  function switchTab(next: Tab) {
    setTab(next);
    setSearchParams(next === "overview" ? {} : { tab: next }, { replace: true });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-charcoal dark:text-white">Site Analytics</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            First-party traffic across every Sweepr site — devices, geography, journeys, and tracking links.
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                days === r.days
                  ? "bg-seafoam-500 text-white"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="-mb-px flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
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

      {tab === "overview" && <OverviewTab days={days} />}
      {tab === "links" && <LinksTab days={days} />}
      {tab === "sessions" && <SessionsTab days={days} />}
    </div>
  );
}
