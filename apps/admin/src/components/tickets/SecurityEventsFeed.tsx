/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldAlert, ShieldBan, RefreshCw, ChevronDown, ChevronRight, CheckCircle2, Siren, Radio,
  TrendingUp, TrendingDown, X, Ban, Globe2,
} from "lucide-react";
import { Card, Badge, Select, Input, Button, EmptyState, toast } from "@sweepr/ui";

export interface SecurityEvent {
  id: string;
  occurred_at: string;
  event_type: "auth_failure" | "rate_limit_exceeded" | "webhook_signature_failure" | "brute_force_suspected" | "forbidden_access" | "other";
  severity: "low" | "medium" | "high" | "critical";
  ip: string | null;
  path: string | null;
  method: string | null;
  clerk_id: string | null;
  user_agent: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  colo: string | null;
  asn: string | null;
  details: Record<string, unknown>;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
}
interface TopIp {
  ip: string;
  count: number;
  country: string | null;
  city: string | null;
  lastSeen: string;
  types: string[];
  suspectedBruteForce?: boolean;
}
interface Summary {
  total: number;
  byType: Array<{ event_type: string; count: number }>;
  topIps: TopIp[];
  last24h: number;
  prevTotal?: number;
  prevByType?: Array<{ event_type: string; count: number }>;
}
interface BlockEntry {
  id: string;
  ip: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
}

const SEVERITY_VARIANT: Record<string, "info" | "warning" | "success" | "error"> = {
  low: "info", medium: "warning", high: "error", critical: "error",
};
const EVENT_TYPES = ["auth_failure", "rate_limit_exceeded", "webhook_signature_failure", "brute_force_suspected", "forbidden_access", "other"];
const SEVERITIES = ["low", "medium", "high", "critical"];
const SINCE_OPTIONS = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

type Authed = (path: string, init?: RequestInit) => Promise<Response>;

export function SecurityEventsFeed({ authed }: { authed: Authed }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [blocklist, setBlocklist] = useState<BlockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiMissing, setApiMissing] = useState(false);
  const [type, setType] = useState("");
  const [severity, setSeverity] = useState("");
  const [ip, setIp] = useState("");
  const [q, setQ] = useState("");
  const [since, setSince] = useState("24h");
  const [resolved, setResolved] = useState<"" | "true" | "false">("false");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drawerIp, setDrawerIp] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadBlocklist = useCallback(async () => {
    try {
      const res = await authed("/security/blocklist");
      if (res.ok) setBlocklist(((await res.json()) as { blocklist: BlockEntry[] }).blocklist ?? []);
    } catch {
      /* blocklist endpoint unavailable — section stays empty */
    }
  }, [authed]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sumRes = await authed(`/security/events/summary?since=${since}`);
      if (sumRes.status === 404) { setApiMissing(true); setSummary(null); setEvents([]); return; }
      if (sumRes.ok) setSummary((await sumRes.json()) as Summary);

      const params = new URLSearchParams({ since });
      if (type) params.set("type", type);
      if (severity) params.set("severity", severity);
      if (ip) params.set("ip", ip);
      if (q) params.set("q", q);
      if (resolved) params.set("resolved", resolved);
      const evRes = await authed(`/security/events?${params.toString()}`);
      if (evRes.status === 404) { setApiMissing(true); setEvents([]); return; }
      if (evRes.ok) {
        const d = (await evRes.json()) as { events?: SecurityEvent[] } | SecurityEvent[];
        setEvents(Array.isArray(d) ? d : d.events ?? []);
        setApiMissing(false);
      }
      void loadBlocklist();
    } catch {
      setApiMissing(true);
    } finally {
      setLoading(false);
    }
  }, [authed, since, type, severity, ip, q, resolved, loadBlocklist]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => void load(), 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, load]);

  async function resolveEvent(id: string) {
    const res = await authed(`/security/events/${id}/resolve`, { method: "POST" });
    if (res.ok) { toast.success("Event resolved."); void load(); }
    else toast.error("Could not resolve event.");
  }

  async function resolveByIp(targetIp: string) {
    const res = await authed(`/security/events/resolve-by-ip`, { method: "POST", body: JSON.stringify({ ip: targetIp }) });
    if (res.ok) { toast.success(`Resolved events from ${targetIp}.`); void load(); }
    else toast.error("Could not resolve events for this IP.");
  }

  async function blockIp(targetIp: string, reason: string) {
    const res = await authed("/security/blocklist", { method: "POST", body: JSON.stringify({ ip: targetIp, reason: reason || undefined }) });
    if (res.ok) { toast.success(`${targetIp} blocked. Enforced at the edge within 60s.`); void loadBlocklist(); }
    else toast.error("Could not block IP.");
  }

  async function unblockIp(entry: BlockEntry) {
    const res = await authed(`/security/blocklist/${entry.id}`, { method: "DELETE" });
    if (res.ok) { toast.success(`${entry.ip} unblocked.`); void loadBlocklist(); }
    else toast.error("Could not unblock IP.");
  }

  const unresolvedCritical = events.filter((e) => !e.resolved && e.severity === "critical").length;
  const bruteForceIps = summary?.topIps.filter((t) => t.suspectedBruteForce).length ?? 0;
  const uniqueIps = summary?.topIps.length ?? new Set(events.map((e) => e.ip).filter(Boolean)).size;
  const blockedSet = new Set(blocklist.map((b) => b.ip));
  const totalDelta = summary?.prevTotal !== undefined ? (summary.total ?? 0) - summary.prevTotal : null;
  const prevTypeCounts = new Map((summary?.prevByType ?? []).map((t) => [t.event_type, t.count]));

  if (apiMissing) {
    return (
      <EmptyState
        icon={<Radio className="h-10 w-10 text-seafoam-500" />}
        title="Live monitoring is active"
        description="The security-events service hasn't reported data yet (or isn't deployed to this environment). Once it is, brute-force attempts, auth failures, and rate-limit strikes will appear here in real time."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* 24h summary strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label={`Events (${since})`} value={summary?.total ?? 0} delta={totalDelta} />
        <StatTile label="Events (24h)" value={summary?.last24h ?? 0} />
        <StatTile label="Unique IPs" value={uniqueIps} />
        <StatTile label="Brute-force suspects" value={bruteForceIps} alert={bruteForceIps > 0} />
        <StatTile label="Unresolved criticals" value={unresolvedCritical} alert={unresolvedCritical > 0} />
      </div>

      {/* Top event types with deltas */}
      {summary && summary.byType.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.byType.map((t) => {
            const prev = prevTypeCounts.get(t.event_type) ?? 0;
            const delta = t.count - prev;
            const active = type === t.event_type;
            return (
              <button
                key={t.event_type}
                onClick={() => setType(active ? "" : t.event_type)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-seafoam-600 bg-seafoam-50 text-seafoam-700 dark:bg-seafoam-900/30"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                }`}
                aria-pressed={active}
              >
                {t.event_type.replace(/_/g, " ")}
                <span className="font-bold">{t.count}</span>
                {delta !== 0 && (
                  <span className={`flex items-center gap-0.5 ${delta > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div className="w-40">
          <Select label="Type" options={[{ value: "", label: "All types" }, ...EVENT_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))]} value={type} onChange={(e) => setType(e.target.value)} />
        </div>
        <div className="w-32">
          <Select label="Severity" options={[{ value: "", label: "All" }, ...SEVERITIES.map((s) => ({ value: s, label: s }))]} value={severity} onChange={(e) => setSeverity(e.target.value)} />
        </div>
        <div className="w-36">
          <Select label="Window" options={SINCE_OPTIONS} value={since} onChange={(e) => setSince(e.target.value)} />
        </div>
        <div className="w-40">
          <Input label="IP" placeholder="Filter by IP" value={ip} onChange={(e) => setIp(e.target.value)} />
        </div>
        <div className="w-44">
          <Input label="Search" placeholder="path, UA, details…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-32">
          <Select label="Resolved" options={[{ value: "", label: "All" }, { value: "false", label: "Unresolved" }, { value: "true", label: "Resolved" }]} value={resolved} onChange={(e) => setResolved(e.target.value as "" | "true" | "false")} />
        </div>
        <label className="flex items-center gap-1.5 pb-2.5 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} aria-label="Auto-refresh every 30 seconds" />
          Auto-refresh (30s)
        </label>
        <button
          onClick={() => void load()}
          aria-label="Refresh events"
          className="mb-0.5 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </Card>

      {/* Top offender IPs */}
      {summary && summary.topIps.length > 0 && (
        <Card className="p-0">
          <h3 className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800">Top source IPs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <th className="whitespace-nowrap px-4 py-2 font-medium">IP</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">Location</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">Events</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">Types</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">Last seen</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">Flags</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {summary.topIps.map((t) => (
                  <tr key={t.ip} className={`border-b border-slate-50 dark:border-slate-800/60 ${t.suspectedBruteForce ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}>
                    <td className="whitespace-nowrap px-4 py-2">
                      <button onClick={() => setDrawerIp(t.ip)} className="font-mono text-xs text-seafoam-700 underline-offset-2 hover:underline" aria-label={`Inspect ${t.ip}`}>{t.ip}</button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-600">{[t.city, t.country].filter(Boolean).join(", ") || ", "}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs font-semibold">{t.count}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">{t.types.join(", ")}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-600">{new Date(t.lastSeen).toLocaleString()}</td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <span className="flex items-center gap-1.5">
                        {t.suspectedBruteForce && (
                          <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white" role="alert">
                            <Siren className="h-3 w-3" /> Brute force
                          </span>
                        )}
                        {blockedSet.has(t.ip) && (
                          <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-800 px-2 py-0.5 text-xs font-bold text-white">
                            <Ban className="h-3 w-3" /> Blocked
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => setDrawerIp(t.ip)} className="whitespace-nowrap rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700" aria-label={`Inspect ${t.ip}`}>Inspect</button>
                        <button onClick={() => void resolveByIp(t.ip)} className="whitespace-nowrap rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700" aria-label={`Resolve all events for ${t.ip}`}>Resolve all</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Live event feed */}
      <Card className="p-0">
        <h3 className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800">Event feed</h3>
        {events.length === 0 ? (
          <EmptyState icon={<ShieldAlert className="h-10 w-10 text-seafoam-500" />} title="Monitoring is active" description="No events match these filters. Auth failures, rate-limit strikes, and brute-force attempts will appear here as they happen." />
        ) : (
          <ul className="divide-y divide-slate-50 dark:divide-slate-800">
            {events.map((e) => {
              const isOpen = !!expanded[e.id];
              return (
                <li key={e.id} className={`p-3 ${e.severity === "critical" && !e.resolved ? "bg-red-50/50 dark:bg-red-950/20" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setExpanded((s) => ({ ...s, [e.id]: !s[e.id] }))} aria-label={isOpen ? "Collapse details" : "Expand details"} className="text-slate-500">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    <Badge variant={SEVERITY_VARIANT[e.severity] ?? "info"}>{e.event_type.replace(/_/g, " ")}</Badge>
                    <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      e.severity === "critical" ? "bg-red-600 text-white"
                      : e.severity === "high" ? "bg-red-100 text-red-700"
                      : e.severity === "medium" ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-500"
                    }`}>{e.severity}</span>
                    {e.event_type === "brute_force_suspected" && (
                      <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white" role="alert">
                        <Siren className="h-3 w-3" /> ATTACK
                      </span>
                    )}
                    {e.ip ? (
                      <button onClick={() => setDrawerIp(e.ip)} className="whitespace-nowrap font-mono text-xs text-seafoam-700 underline-offset-2 hover:underline" aria-label={`Inspect ${e.ip}`}>{e.ip}</button>
                    ) : (
                      <span className="font-mono text-xs text-slate-700 dark:text-slate-200">, </span>
                    )}
                    {e.ip && blockedSet.has(e.ip) && (
                      <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white"><Ban className="h-2.5 w-2.5" /> blocked</span>
                    )}
                    {e.method && <span className="whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-800">{e.method}</span>}
                    {e.path && <span className="truncate font-mono text-xs text-slate-500">{e.path}</span>}
                    {(e.city || e.country) && <span className="whitespace-nowrap text-xs text-slate-500">{[e.city, e.country].filter(Boolean).join(", ")}</span>}
                    <span className="whitespace-nowrap text-xs text-slate-500">{new Date(e.occurred_at).toLocaleString()}</span>
                    <div className="ml-auto flex items-center gap-2">
                      {e.resolved ? (
                        <span className="flex items-center gap-1 whitespace-nowrap text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> Resolved</span>
                      ) : (
                        <Button onClick={() => void resolveEvent(e.id)} size="sm" aria-label={`Resolve event ${e.id}`}>Resolve</Button>
                      )}
                    </div>
                  </div>
                  {e.user_agent && (
                    <p className="mt-1 truncate pl-6 text-[11px] text-slate-400" title={e.user_agent}>{e.user_agent}</p>
                  )}
                  {isOpen && (
                    <pre className="mt-2 ml-6 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                      {JSON.stringify({ clerk_id: e.clerk_id, region: e.region, colo: e.colo, asn: e.asn, details: e.details, resolved_by: e.resolved_by, resolved_at: e.resolved_at }, null, 2)}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Blocklist management */}
      <BlocklistCard blocklist={blocklist} onBlock={blockIp} onUnblock={unblockIp} />

      {drawerIp && (
        <IpDrawer
          ip={drawerIp}
          authed={authed}
          blockedEntry={blocklist.find((b) => b.ip === drawerIp) ?? null}
          onClose={() => setDrawerIp(null)}
          onBlock={blockIp}
          onUnblock={unblockIp}
          onResolveAll={resolveByIp}
        />
      )}
    </div>
  );
}

function BlocklistCard({
  blocklist,
  onBlock,
  onUnblock,
}: {
  blocklist: BlockEntry[];
  onBlock: (ip: string, reason: string) => Promise<void>;
  onUnblock: (entry: BlockEntry) => Promise<void>;
}) {
  const [newIp, setNewIp] = useState("");
  const [newReason, setNewReason] = useState("");

  async function add() {
    if (!newIp.trim()) return;
    await onBlock(newIp.trim(), newReason.trim());
    setNewIp("");
    setNewReason("");
  }

  return (
    <Card className="p-0">
      <h3 className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800">
        <ShieldBan className="h-3.5 w-3.5" /> IP blocklist ({blocklist.length})
      </h3>
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
        <div className="w-44">
          <Input label="IP address" placeholder="203.0.113.7" value={newIp} onChange={(e) => setNewIp(e.target.value)} />
        </div>
        <div className="min-w-[12rem] flex-1">
          <Input label="Reason" placeholder="Why is this IP being blocked?" value={newReason} onChange={(e) => setNewReason(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => void add()} disabled={!newIp.trim()}><Ban className="h-4 w-4" /> Block IP</Button>
      </div>
      {blocklist.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-600">No blocked IPs. Blocked addresses are rejected at the edge with 403.</p>
      ) : (
        <ul className="divide-y divide-slate-50 dark:divide-slate-800">
          {blocklist.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="font-mono text-xs font-semibold text-charcoal dark:text-white">{b.ip}</span>
              {b.expires_at && <Badge variant="warning">expires {new Date(b.expires_at).toLocaleString()}</Badge>}
              <span className="text-xs text-slate-500">{b.reason ?? "no reason recorded"}</span>
              <span className="ml-auto whitespace-nowrap text-xs text-slate-400">{b.created_by ?? ", "} · {new Date(b.created_at).toLocaleString()}</span>
              <button onClick={() => void onUnblock(b)} className="whitespace-nowrap rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700" aria-label={`Unblock ${b.ip}`}>Unblock</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function IpDrawer({
  ip,
  authed,
  blockedEntry,
  onClose,
  onBlock,
  onUnblock,
  onResolveAll,
}: {
  ip: string;
  authed: Authed;
  blockedEntry: BlockEntry | null;
  onClose: () => void;
  onBlock: (ip: string, reason: string) => Promise<void>;
  onUnblock: (entry: BlockEntry) => Promise<void>;
  onResolveAll: (ip: string) => Promise<void>;
}) {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await authed(`/security/events?ip=${encodeURIComponent(ip)}&since=all&limit=200`);
        if (res.ok) {
          const d = (await res.json()) as { events?: SecurityEvent[] };
          setEvents(d.events ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [authed, ip]);

  const latestGeo = events.find((e) => e.country || e.asn || e.city);
  const unresolved = events.filter((e) => !e.resolved).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Events from ${ip}`} className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="flex items-center gap-2 font-mono text-lg font-bold text-charcoal dark:text-white">
              <Globe2 className="h-5 w-5 text-seafoam-600" /> {ip}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {latestGeo ? [latestGeo.city, latestGeo.region, latestGeo.country].filter(Boolean).join(", ") || "Location unknown" : "Location unknown"}
              {latestGeo?.asn ? ` · ASN ${latestGeo.asn}` : ""}
              {latestGeo?.colo ? ` · via ${latestGeo.colo}` : ""}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close IP details" className="text-slate-500 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          {blockedEntry ? (
            <>
              <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-800 px-2.5 py-1 text-xs font-bold text-white"><Ban className="h-3 w-3" /> Blocked</span>
              <Button size="sm" variant="secondary" onClick={() => void onUnblock(blockedEntry)}>Unblock</Button>
            </>
          ) : (
            <>
              <div className="min-w-[10rem] flex-1">
                <Input aria-label="Block reason" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <Button size="sm" variant="danger" onClick={() => void onBlock(ip, reason)}><Ban className="h-4 w-4" /> Block IP</Button>
            </>
          )}
          {unresolved > 0 && (
            <Button size="sm" variant="secondary" onClick={() => void onResolveAll(ip)}>Resolve all ({unresolved})</Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">All events from this IP ({events.length})</h3>
          {loading ? (
            <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ) : events.length === 0 ? (
            <p className="text-sm text-slate-600">No recorded events.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className={`rounded-lg border p-2.5 text-xs ${e.severity === "critical" && !e.resolved ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20" : "border-slate-100 dark:border-slate-800"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={SEVERITY_VARIANT[e.severity] ?? "info"}>{e.event_type.replace(/_/g, " ")}</Badge>
                    <span className="text-slate-500">{new Date(e.occurred_at).toLocaleString()}</span>
                    {e.resolved && <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3 w-3" /> resolved</span>}
                  </div>
                  <p className="mt-1 truncate font-mono text-slate-500">{e.method ?? ""} {e.path ?? ""}</p>
                  {e.user_agent && <p className="mt-0.5 truncate text-slate-400" title={e.user_agent}>{e.user_agent}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, alert, delta }: { label: string; value: number; alert?: boolean; delta?: number | null }) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"}`}>
      <p className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className={`text-2xl font-bold ${alert ? "text-red-700 dark:text-red-400" : "text-charcoal dark:text-white"}`}>{value}</p>
        {delta != null && delta !== 0 && (
          <span className={`flex items-center gap-0.5 whitespace-nowrap text-xs font-semibold ${delta > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {delta > 0 ? `+${delta}` : delta} vs prev
          </span>
        )}
      </div>
    </div>
  );
}
