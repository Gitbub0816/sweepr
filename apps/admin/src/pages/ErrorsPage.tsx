/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Server,
  Monitor,
  Copy,
  Check,
  Search,
  Layers,
  List,
  RotateCcw,
} from "lucide-react";
import { ErrorDetailDrawer } from "../components/errors/ErrorDetailDrawer";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface ErrorRow {
  id: string;
  occurred_at: string;
  source: "server" | "client";
  app: string | null;
  level: string;
  message: string;
  stack: string | null;
  path: string | null;
  method: string | null;
  status_code: number | null;
  clerk_id: string | null;
  request_id: string | null;
  resolved: boolean;
  resolved_at: string | null;
  fingerprint: string | null;
  reference_id: string | null;
  error_name: string | null;
  error_code: string | null;
  duration_ms: number | null;
}

interface ErrorGroup {
  fingerprint: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  level: string;
  message: string;
  errorName: string | null;
  errorCode: string | null;
  path: string | null;
  apps: string[] | null;
  unresolvedCount: number;
  sampleId: string;
}

interface Counts {
  unresolved: number;
  last_24h: number;
  server_open: number;
  client_open: number;
}

const LEVEL_COLOR: Record<string, string> = {
  fatal: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
  warn: "bg-amber-100 text-amber-700",
};

const RANGE_OPTIONS = [
  { value: "", label: "All time" },
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
] as const;

function rangeToSince(range: string): string | null {
  if (!range) return null;
  const ms: Record<string, number> = {
    "1h": 3_600_000,
    "24h": 86_400_000,
    "7d": 7 * 86_400_000,
    "30d": 30 * 86_400_000,
  };
  const delta = ms[range];
  if (!delta) return null;
  return new Date(Date.now() - delta).toISOString();
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-bold text-charcoal">{value}</p>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-charcoal text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

export function ErrorsPage() {
  const { getToken } = useAuth();

  const [view, setView] = useState<"grouped" | "stream">("grouped");
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [groups, setGroups] = useState<ErrorGroup[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Filters
  const [sourceFilter, setSourceFilter] = useState<"" | "server" | "client">("");
  const [levelFilter, setLevelFilter] = useState<"" | "error" | "warn" | "fatal">("");
  const [appFilter, setAppFilter] = useState("");
  const [includeResolved, setIncludeResolved] = useState(false);
  const [range, setRange] = useState<string>("24h");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [fingerprintFilter, setFingerprintFilter] = useState<string | null>(null);

  // Debounce free-text search.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (sourceFilter) params.set("source", sourceFilter);
    if (levelFilter) params.set("level", levelFilter);
    if (appFilter) params.set("app", appFilter);
    if (includeResolved) params.set("resolved", "true");
    if (q) params.set("q", q);
    const since = rangeToSince(range);
    if (since) params.set("since", since);
    if (fingerprintFilter) params.set("fingerprint", fingerprintFilter);
    return params;
  }, [sourceFilter, levelFilter, appFilter, includeResolved, q, range, fingerprintFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const params = buildParams();

      if (view === "stream") {
        const res = await fetch(`${API}/admin/observability/errors?${params}`, { headers });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { errors: ErrorRow[]; counts: Counts };
        setErrors(data.errors ?? []);
        setCounts(data.counts ?? null);
      } else {
        // Groups endpoint doesn't take a fingerprint filter (grouping by it is
        // meaningless); if one is set, fall back to the stream view's counts
        // but still fetch groups for the rest of the dashboard context.
        const groupParams = new URLSearchParams(params);
        groupParams.delete("fingerprint");
        const [groupsRes, countsRes] = await Promise.all([
          fetch(`${API}/admin/observability/errors/groups?${groupParams}`, { headers }),
          fetch(`${API}/admin/observability/errors?limit=1&${params}`, { headers }),
        ]);
        if (groupsRes.ok) {
          const data = (await groupsRes.json()) as { groups: ErrorGroup[] };
          setGroups(data.groups ?? []);
        } else {
          setGroups([]);
        }
        if (countsRes.ok) {
          const data = (await countsRes.json()) as { counts: Counts };
          setCounts(data.counts ?? null);
        }
      }
    } catch {
      setErrors([]);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, view, buildParams]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 30s.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => loadRef.current(), 30_000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  async function copyAll() {
    const text =
      view === "stream"
        ? errors
            .map((e) =>
              [
                `[${new Date(e.occurred_at).toISOString()}] ${e.level.toUpperCase()} ${e.source}${e.app ? `/${e.app}` : ""}`,
                `${e.method ?? ""} ${e.path ?? ""}${e.status_code != null ? ` → ${e.status_code}` : ""}`.trim(),
                e.message,
                e.reference_id ? `ref: ${e.reference_id}` : "",
                e.fingerprint ? `fingerprint: ${e.fingerprint}` : "",
                e.clerk_id ? `user: ${e.clerk_id}` : "",
                e.request_id ? `ray: ${e.request_id}` : "",
                e.stack ? `\n${e.stack}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
            )
            .join("\n\n────────────────────\n\n")
        : groups
            .map((g) =>
              [
                `[${new Date(g.lastSeen).toISOString()}] ${g.level.toUpperCase()} ×${g.count} (${g.unresolvedCount} open)`,
                g.errorName ? `${g.errorName}${g.errorCode ? ` (${g.errorCode})` : ""}` : "",
                g.message,
                g.path ?? "",
                `fingerprint: ${g.fingerprint}`,
                g.apps?.length ? `apps: ${g.apps.join(", ")}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
            )
            .join("\n\n────────────────────\n\n");
    try {
      await navigator.clipboard.writeText(text || "No errors.");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function resolveGroup(fingerprint: string) {
    const token = await getToken();
    await fetch(`${API}/admin/observability/errors/groups/${encodeURIComponent(fingerprint)}/resolve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  }

  function viewGroupInStream(fingerprint: string) {
    setSelectedId(null);
    setFingerprintFilter(fingerprint);
    setView("stream");
  }

  const isEmpty = view === "stream" ? errors.length === 0 : groups.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-charcoal">Errors</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Server &amp; client-side errors across every Sweepr app.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={copyAll}
            disabled={isEmpty}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy all"}
          </button>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-seafoam-500"
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Open" value={counts?.unresolved ?? "—"} />
        <StatCard label="Last 24h" value={counts?.last_24h ?? "—"} />
        <StatCard label="Server (open)" value={counts?.server_open ?? "—"} />
        <StatCard label="Client (open)" value={counts?.client_open ?? "—"} />
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setView("grouped")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "grouped" ? "bg-white text-charcoal shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Layers className="h-3.5 w-3.5" /> Grouped
          </button>
          <button
            type="button"
            onClick={() => setView("stream")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "stream" ? "bg-white text-charcoal shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <List className="h-3.5 w-3.5" /> Stream
          </button>
        </div>
        {fingerprintFilter && (
          <span className="flex items-center gap-1.5 rounded-full bg-seafoam-50 px-3 py-1 text-xs font-medium text-seafoam-700">
            Filtered to group {fingerprintFilter.slice(0, 10)}…
            <button
              type="button"
              onClick={() => setFingerprintFilter(null)}
              aria-label="Clear group filter"
              className="text-seafoam-700 hover:text-seafoam-900"
            >
              ×
            </button>
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search message, path, reference…"
            aria-label="Search errors"
            className="w-64 rounded-full border border-slate-200 py-1.5 pl-8 pr-3 text-xs focus:border-seafoam-500 focus:outline-none focus:ring-1 focus:ring-seafoam-500"
          />
        </div>
        {(["", "server", "client"] as const).map((s) => (
          <Pill key={s || "all"} active={sourceFilter === s} onClick={() => setSourceFilter(s)}>
            {s === "" ? "All sources" : s === "server" ? "Server" : "Client"}
          </Pill>
        ))}
        {(["", "error", "warn", "fatal"] as const).map((lvl) => (
          <Pill key={lvl || "all-levels"} active={levelFilter === lvl} onClick={() => setLevelFilter(lvl)}>
            {lvl === "" ? "All levels" : lvl}
          </Pill>
        ))}
        <input
          value={appFilter}
          onChange={(e) => setAppFilter(e.target.value)}
          placeholder="app…"
          aria-label="Filter by app"
          className="w-24 rounded-full border border-slate-200 px-3 py-1.5 text-xs focus:border-seafoam-500 focus:outline-none focus:ring-1 focus:ring-seafoam-500"
        />
        <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.value || "all"}
              type="button"
              onClick={() => setRange(r.value)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                range === r.value ? "bg-white text-charcoal shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <label className="ml-2 flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={includeResolved}
            onChange={(e) => setIncludeResolved(e.target.checked)}
            className="accent-seafoam-500"
          />
          Show resolved
        </label>
      </div>

      {/* List */}
      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      ) : isEmpty ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-600">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
          No errors. Everything's running clean.
        </div>
      ) : view === "stream" ? (
        <div className="space-y-2">
          {errors.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelectedId(e.id)}
              className={`block w-full rounded-xl border bg-white p-4 text-left transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500 ${
                e.resolved ? "border-slate-100 opacity-60" : "border-slate-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0">
                  {e.source === "server" ? (
                    <Server className="h-4 w-4 text-slate-600" />
                  ) : (
                    <Monitor className="h-4 w-4 text-slate-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_COLOR[e.level] ?? "bg-slate-100 text-slate-500"}`}>
                      {e.level}
                    </span>
                    {e.app && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{e.app}</span>
                    )}
                    {e.error_name && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{e.error_name}</span>
                    )}
                    {e.status_code != null && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {e.method} {e.status_code}
                      </span>
                    )}
                    {e.duration_ms != null && (
                      <span className="text-xs text-slate-400">{e.duration_ms}ms</span>
                    )}
                    <span className="text-xs text-slate-600">{new Date(e.occurred_at).toLocaleString()}</span>
                    {e.resolved && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Resolved
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 break-words font-mono text-sm text-charcoal">{e.message}</p>
                  {e.path && <p className="mt-0.5 truncate font-mono text-xs text-slate-600">{e.path}</p>}
                  {e.reference_id && (
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">{e.reference_id}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <div
              key={g.fingerprint}
              className={`rounded-xl border bg-white p-4 ${g.unresolvedCount === 0 ? "border-slate-100 opacity-60" : "border-slate-200"}`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedId(g.sampleId)}
                  className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500 rounded-lg"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center justify-center rounded-full bg-slate-800 px-2 py-0.5 text-xs font-bold text-white">
                      ×{g.count}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_COLOR[g.level] ?? "bg-slate-100 text-slate-500"}`}>
                      {g.level}
                    </span>
                    {g.errorName && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {g.errorName}
                        {g.errorCode ? ` · ${g.errorCode}` : ""}
                      </span>
                    )}
                    {g.apps?.map((a) => (
                      <span key={a} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {a}
                      </span>
                    ))}
                    {g.unresolvedCount > 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        {g.unresolvedCount} open
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> All resolved
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 break-words font-mono text-sm text-charcoal">{g.message}</p>
                  {g.path && <p className="mt-0.5 truncate font-mono text-xs text-slate-600">{g.path}</p>}
                  <p className="mt-1 text-xs text-slate-400">
                    First seen {new Date(g.firstSeen).toLocaleString()} · Last seen {new Date(g.lastSeen).toLocaleString()}
                  </p>
                </button>
                <div className="flex flex-shrink-0 flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => viewGroupInStream(g.fingerprint)}
                    className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-700"
                  >
                    <List className="h-3.5 w-3.5" /> View all
                  </button>
                  {g.unresolvedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => resolveGroup(g.fingerprint)}
                      className="flex items-center gap-1.5 rounded-lg bg-seafoam-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-seafoam-600"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Resolve all
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-slate-600">
        <AlertTriangle className="h-3.5 w-3.5" />
        Errors are captured automatically from the API and every frontend app.
      </p>

      {selectedId && (
        <ErrorDetailDrawer
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onResolved={load}
          onViewGroup={(fp) => {
            viewGroupInStream(fp);
          }}
        />
      )}
    </div>
  );
}
