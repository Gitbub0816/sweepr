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
  ShieldAlert, RefreshCw, ChevronDown, ChevronRight, CheckCircle2, Siren, Radio,
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
}

const SEVERITY_VARIANT: Record<string, "info" | "warning" | "success" | "error"> = {
  low: "info", medium: "warning", high: "error", critical: "error",
};
const EVENT_TYPES = ["auth_failure", "rate_limit_exceeded", "webhook_signature_failure", "brute_force_suspected", "forbidden_access", "other"];
const SINCE_OPTIONS = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

export function SecurityEventsFeed({ authed }: { authed: (path: string, init?: RequestInit) => Promise<Response> }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiMissing, setApiMissing] = useState(false);
  const [type, setType] = useState("");
  const [ip, setIp] = useState("");
  const [q, setQ] = useState("");
  const [since, setSince] = useState("24h");
  const [resolved, setResolved] = useState<"" | "true" | "false">("false");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sumRes = await authed(`/security/events/summary?since=${since}`);
      if (sumRes.status === 404) { setApiMissing(true); setSummary(null); setEvents([]); return; }
      if (sumRes.ok) setSummary((await sumRes.json()) as Summary);

      const params = new URLSearchParams({ since });
      if (type) params.set("type", type);
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
    } catch {
      setApiMissing(true);
    } finally {
      setLoading(false);
    }
  }, [authed, since, type, ip, q, resolved]);

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

  const unresolvedCritical = events.filter((e) => !e.resolved && e.severity === "critical").length;
  const bruteForceIps = summary?.topIps.filter((t) => t.suspectedBruteForce).length ?? 0;
  const uniqueIps = summary?.topIps.length ?? new Set(events.map((e) => e.ip).filter(Boolean)).size;

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
      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Events (24h)" value={summary?.last24h ?? 0} />
        <StatTile label="Unique IPs" value={uniqueIps} />
        <StatTile label="Brute-force suspects" value={bruteForceIps} alert={bruteForceIps > 0} />
        <StatTile label="Unresolved criticals" value={unresolvedCritical} alert={unresolvedCritical > 0} />
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div className="w-40">
          <Select label="Type" options={[{ value: "", label: "All types" }, ...EVENT_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))]} value={type} onChange={(e) => setType(e.target.value)} />
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
        <div className="w-36">
          <Select label="Resolved" options={[{ value: "", label: "All" }, { value: "false", label: "Unresolved" }, { value: "true", label: "Resolved" }]} value={resolved} onChange={(e) => setResolved(e.target.value as "" | "true" | "false")} />
        </div>
        <label className="flex items-center gap-1.5 pb-2.5 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} aria-label="Auto-refresh every 30 seconds" />
          Auto-refresh (30s)
        </label>
        <button
          onClick={() => void load()}
          aria-label="Refresh events"
          className="mb-0.5 flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </Card>

      {/* Top offender IPs */}
      {summary && summary.topIps.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <h3 className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800">Top offender IPs</h3>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <th className="px-4 py-2 font-medium">IP</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Events</th>
                <th className="px-4 py-2 font-medium">Types</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
                <th className="px-4 py-2 font-medium">Flags</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {summary.topIps.map((t) => (
                <tr key={t.ip} className={`border-b border-slate-50 dark:border-slate-800/60 ${t.suspectedBruteForce ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}>
                  <td className="px-4 py-2 font-mono text-xs">{t.ip}</td>
                  <td className="px-4 py-2 text-xs text-slate-600">{[t.city, t.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-4 py-2 text-xs font-semibold">{t.count}</td>
                  <td className="px-4 py-2 text-xs text-slate-600">{t.types.join(", ")}</td>
                  <td className="px-4 py-2 text-xs text-slate-600">{new Date(t.lastSeen).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    {t.suspectedBruteForce && (
                      <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white" role="alert">
                        <Siren className="h-3 w-3" /> Brute force
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button onClick={() => setIp(t.ip)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700" aria-label={`Filter events by ${t.ip}`}>Filter</button>
                      <button onClick={() => void resolveByIp(t.ip)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700" aria-label={`Resolve all events for ${t.ip}`}>Resolve all</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                    {e.event_type === "brute_force_suspected" && (
                      <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white" role="alert">
                        <Siren className="h-3 w-3" /> ATTACK
                      </span>
                    )}
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-200">{e.ip ?? "—"}</span>
                    {e.method && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-800">{e.method}</span>}
                    {e.path && <span className="truncate font-mono text-xs text-slate-500">{e.path}</span>}
                    {(e.city || e.country) && <span className="text-xs text-slate-500">{[e.city, e.country].filter(Boolean).join(", ")}</span>}
                    <span className="text-xs text-slate-500">{new Date(e.occurred_at).toLocaleString()}</span>
                    <div className="ml-auto flex items-center gap-2">
                      {e.resolved ? (
                        <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> Resolved</span>
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
    </div>
  );
}

function StatTile({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${alert ? "text-red-700 dark:text-red-400" : "text-charcoal dark:text-white"}`}>{value}</p>
    </div>
  );
}
