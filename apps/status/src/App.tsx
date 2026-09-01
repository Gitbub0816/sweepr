/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useState, useRef } from "react";
import { Wrench, Calendar } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
type IncidentSeverity = "minor" | "moderate" | "major" | "critical";

interface StatusUpdate {
  id: string;
  incident_id: string;
  message: string;
  status: string;
  created_at: string;
}

interface Incident {
  id: string;
  title: string;
  summary: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  affected_features: string[];
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  updates: StatusUpdate[];
}

interface MaintenanceWindow {
  id: string;
  title: string;
  description: string | null;
  scheduled_start: string;
  scheduled_end: string;
  affected_services: string[];
  status: string;
}

interface StatusData {
  incidents: Incident[];
  maintenance: MaintenanceWindow[];
}

interface ComponentStatus {
  key: string;
  label: string;
  ok: boolean | null;
  latencyMs: number | null;
  checkedAt: string | null;
  uptime90: number | null;
  days: Array<{ date: string; pct: number }>;
}

const STATUS_COLORS: Record<IncidentStatus, string> = {
  investigating: "bg-amber-100 text-amber-800 border border-amber-200",
  identified: "bg-amber-100 text-amber-800 border border-amber-200",
  monitoring: "bg-seafoam-100 text-seafoam-800 border border-seafoam-200",
  resolved: "bg-seafoam-100 text-seafoam-800 border border-seafoam-200",
};

const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  minor: "bg-slate-100 text-slate-700 border border-slate-200",
  moderate: "bg-amber-100 text-amber-800 border border-amber-200",
  major: "bg-amber-200 text-amber-900 border border-amber-300",
  critical: "bg-red-100 text-red-800 border border-red-200",
};

function StatusBadge({ text, className }: { text: string; className: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {text}
    </span>
  );
}

function UptimeBar({ days }: { days: Array<{ date: string; pct: number }> }) {
  const cells = days.slice(-90);
  return (
    <div className="flex h-6 items-end gap-[2px]" aria-hidden="true">
      {cells.map((d) => (
        <div
          key={d.date}
          title={`${d.date}: ${d.pct.toFixed(1)}% up`}
          className={`w-[3px] rounded-sm ${d.pct >= 99 ? "h-6 bg-green-400" : d.pct >= 90 ? "h-6 bg-yellow-400" : "h-6 bg-red-400"}`}
        />
      ))}
    </div>
  );
}

function ComponentRow({ c }: { c: ComponentStatus }) {
  const state = c.ok === null ? "unknown" : c.ok ? "operational" : "down";
  const chip =
    state === "operational"
      ? "bg-green-100 text-green-800 border border-green-200"
      : state === "down"
        ? "bg-red-100 text-red-800 border border-red-200"
        : "bg-slate-100 text-slate-600 border border-slate-200";
  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{c.label}</p>
        <p className="text-xs text-slate-500">
          {c.uptime90 !== null ? `${c.uptime90.toFixed(2)}% uptime (90d)` : "collecting data…"}
          {c.latencyMs !== null && c.ok ? ` · ${c.latencyMs}ms` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <UptimeBar days={c.days} />
        <StatusBadge text={state} className={chip} />
      </div>
    </div>
  );
}

function IncidentCard({ incident }: { incident: Incident }) {
  const [subEmail, setSubEmail] = useState("");
  const [subDone, setSubDone] = useState(false);
  const [subLoading, setSubLoading] = useState(false);

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    setSubLoading(true);
    try {
      await fetch(`${API_URL}/status/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: subEmail, incidentId: incident.id }),
      });
      setSubDone(true);
    } finally {
      setSubLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h3 className="text-base font-semibold text-charcoal">{incident.title}</h3>
        <StatusBadge text={incident.status} className={STATUS_COLORS[incident.status]} />
        <StatusBadge text={incident.severity} className={SEVERITY_COLORS[incident.severity]} />
      </div>

      <p className="text-sm text-slate-600 mb-3">{incident.summary}</p>

      {incident.affected_features.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {incident.affected_features.map((f) => (
            <span key={f} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{f}</span>
          ))}
        </div>
      )}

      {incident.updates.length > 0 && (
        <div className="mb-4 border-t border-slate-100 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Timeline</h4>
          <div className="space-y-2">
            {[...incident.updates].reverse().map((u) => (
              <div key={u.id} className="flex gap-3 text-sm items-start">
                <span className="text-slate-600 whitespace-nowrap text-xs pt-0.5">
                  {new Date(u.created_at).toLocaleString()}
                </span>
                <StatusBadge text={u.status}
                  className={STATUS_COLORS[u.status as IncidentStatus] ?? "bg-slate-100 text-slate-700 border border-slate-200"} />
                <span className="text-slate-700">{u.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-slate-100 pt-4">
        {subDone ? (
          <p className="text-sm text-seafoam-700 font-medium">Subscribed! We'll email you with updates.</p>
        ) : (
          <form onSubmit={(e) => void subscribe(e)} className="flex gap-2">
            <label htmlFor="incident-email-input" className="sr-only">Email address</label>
            <input id="incident-email-input" type="email" required value={subEmail} onChange={(e) => setSubEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400" />
            <button type="submit" disabled={subLoading}
              className="rounded-lg bg-seafoam-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-seafoam-800 disabled:opacity-50 transition-colors whitespace-nowrap">
              Subscribe to updates
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function MaintenanceCard({ window: w }: { window: MaintenanceWindow }) {
  const start = new Date(w.scheduled_start);
  const end = new Date(w.scheduled_end);
  const isNow = w.status === "in_progress";
  return (
    <div className={`rounded-xl border p-5 ${isNow ? "border-yellow-200 bg-yellow-50" : "border-blue-100 bg-blue-50"}`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center ${isNow ? "text-amber-600" : "text-seafoam-700"}`}
          role="img"
          aria-label={isNow ? "Maintenance in progress" : "Scheduled maintenance"}
        >
          {isNow ? <Wrench className="h-4 w-4" aria-hidden="true" /> : <Calendar className="h-4 w-4" aria-hidden="true" />}
        </span>
        <div>
          <p className="text-sm font-semibold text-charcoal">{w.title}</p>
          {w.description && <p className="text-xs text-slate-600 mt-0.5">{w.description}</p>}
          <p className="text-xs text-slate-500 mt-1">
            {isNow ? "Currently in progress · " : ""}
            {start.toLocaleString()} – {end.toLocaleString()}
          </p>
          {w.affected_services.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {w.affected_services.map((s) => (
                <span key={s} className="rounded bg-white/80 border border-slate-200 px-1.5 py-0.5 text-xs text-slate-600">{s}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`${API_URL}/status/newsletter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="newsletter" className="mt-12 rounded-xl border border-seafoam-100 bg-seafoam-50 p-8 text-center">
      <h2 className="text-xl font-bold text-charcoal mb-2">Stay in the loop</h2>
      <p className="text-slate-600 mb-6">Get notified when Sweepr launches and for important status updates.</p>
      {done ? (
        <p className="text-seafoam-700 font-semibold">You're subscribed!</p>
      ) : (
        <form onSubmit={(e) => void subscribe(e)} className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
          <label htmlFor="newsletter-email-input" className="sr-only">Email address</label>
          <input id="newsletter-email-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400 bg-white" />
          <button type="submit" disabled={loading}
            className="rounded-lg bg-seafoam-700 px-5 py-2 text-sm font-semibold text-white hover:bg-seafoam-800 disabled:opacity-50 transition-colors">
            {loading ? "…" : "Subscribe"}
          </button>
        </form>
      )}
    </section>
  );
}

export default function App() {
  const [data, setData] = useState<StatusData | null>(null);
  const [components, setComponents] = useState<ComponentStatus[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchStatus() {
    try {
      const res = await fetch(`${API_URL}/status`);
      if (res.ok) setData(await res.json() as StatusData);
      const cres = await fetch(`${API_URL}/status/components`);
      if (cres.ok) setComponents(((await cres.json()) as { components: ComponentStatus[] }).components);
    } catch {
      // network error — keep showing previous data
    }
  }

  useEffect(() => {
    void fetchStatus();
    intervalRef.current = setInterval(() => void fetchStatus(), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const hasActiveIncidents = (data?.incidents ?? []).length > 0;
  const hasCritical = data?.incidents.some((i) => i.severity === "critical") ?? false;
  const hasMajor = data?.incidents.some((i) => i.severity === "major") ?? false;
  const hasModerate = data?.incidents.some((i) => i.severity === "moderate") ?? false;
  const upcomingMaintenance = (data?.maintenance ?? []).filter((m) => m.status === "scheduled");
  const activeMaintenance = (data?.maintenance ?? []).filter((m) => m.status === "in_progress");

  let overallStatus: { label: string; color: string; dot: string };
  if (!data) {
    overallStatus = { label: "Loading…", color: "text-slate-500", dot: "bg-slate-300" };
  } else if (!hasActiveIncidents) {
    overallStatus = { label: "All Systems Operational", color: "text-green-700", dot: "bg-green-500" };
  } else if (hasCritical || hasMajor) {
    overallStatus = { label: "Service Disruption", color: "text-red-700", dot: "bg-red-500" };
  } else if (hasModerate) {
    overallStatus = { label: "Degraded Performance", color: "text-orange-700", dot: "bg-orange-400" };
  } else {
    overallStatus = { label: "Minor Service Issues", color: "text-yellow-700", dot: "bg-yellow-400" };
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <img src="/brand/sweepr-logo.svg" className="h-14 w-auto" alt="Sweepr" />
          <a href="https://getsweepr.com" className="text-sm text-slate-500 hover:text-seafoam-700 transition-colors">
            getsweepr.com
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        {/* Overall status */}
        <div className="mb-8 rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${overallStatus.dot} animate-pulse`} />
            <h1 className={`text-xl font-bold ${overallStatus.color}`}>{overallStatus.label}</h1>
          </div>
          {data && <p className="mt-1 text-sm text-slate-600">Last updated {new Date().toLocaleTimeString()}</p>}
        </div>

        {/* Active maintenance in progress */}
        {activeMaintenance.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Maintenance in Progress</h2>
            <div className="space-y-3">
              {activeMaintenance.map((m) => <MaintenanceCard key={m.id} window={m} />)}
            </div>
          </section>
        )}

        {/* Component health */}
        {components.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Components</h2>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-1 shadow-sm">
              {components.map((c) => <ComponentRow key={c.key} c={c} />)}
            </div>
          </section>
        )}

        {/* Active incidents */}
        {data && data.incidents.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Active Incidents</h2>
            <div className="space-y-4">
              {data.incidents.map((incident) => <IncidentCard key={incident.id} incident={incident} />)}
            </div>
          </section>
        )}

        {data && data.incidents.length === 0 && activeMaintenance.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-8 text-center text-slate-500">
            <p className="text-sm">No active incidents. Everything is running smoothly.</p>
          </div>
        )}

        {/* Upcoming maintenance */}
        {upcomingMaintenance.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Scheduled Maintenance</h2>
            <div className="space-y-3">
              {upcomingMaintenance.map((m) => <MaintenanceCard key={m.id} window={m} />)}
            </div>
          </section>
        )}

        <NewsletterSection />
      </main>

      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-6">
          <img src="/brand/sweepr-logo.svg" className="h-10 w-auto opacity-60" alt="Sweepr" />
          <p className="text-xs text-slate-600">Copyright &copy; 2026&ndash;Present Sweepr, operated by ClearKey Solutions, LLC. All Rights Reserved.</p>
        </div>
      </footer>
    </div>
  );
}
