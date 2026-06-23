import { useEffect, useState, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
type IncidentSeverity = "minor" | "major" | "critical";

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
  is_prelaunch_update: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  updates: StatusUpdate[];
}

interface SiteSettings {
  prelaunch_cleaner: boolean;
  prelaunch_customer: boolean;
}

interface StatusData {
  settings: SiteSettings;
  incidents: Incident[];
}

const STATUS_COLORS: Record<IncidentStatus, string> = {
  investigating: "bg-yellow-100 text-yellow-800 border border-yellow-200",
  identified: "bg-orange-100 text-orange-800 border border-orange-200",
  monitoring: "bg-blue-100 text-blue-800 border border-blue-200",
  resolved: "bg-green-100 text-green-800 border border-green-200",
};

const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  minor: "bg-slate-100 text-slate-700 border border-slate-200",
  major: "bg-orange-100 text-orange-800 border border-orange-200",
  critical: "bg-red-100 text-red-800 border border-red-200",
};

function StatusBadge({ text, className }: { text: string; className: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {text}
    </span>
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
        <StatusBadge
          text={incident.status}
          className={STATUS_COLORS[incident.status]}
        />
        <StatusBadge
          text={incident.severity}
          className={SEVERITY_COLORS[incident.severity]}
        />
      </div>

      <p className="text-sm text-slate-600 mb-3">{incident.summary}</p>

      {incident.affected_features.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {incident.affected_features.map((f) => (
            <span
              key={f}
              className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {incident.updates.length > 0 && (
        <div className="mb-4 border-t border-slate-100 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
            Timeline
          </h4>
          <div className="space-y-2">
            {[...incident.updates].reverse().map((u) => (
              <div key={u.id} className="flex gap-3 text-sm items-start">
                <span className="text-slate-400 whitespace-nowrap text-xs pt-0.5">
                  {new Date(u.created_at).toLocaleString()}
                </span>
                <StatusBadge
                  text={u.status}
                  className={STATUS_COLORS[u.status as IncidentStatus] ?? "bg-slate-100 text-slate-700"}
                />
                <span className="text-slate-700">{u.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-slate-100 pt-4">
        {subDone ? (
          <p className="text-sm text-seafoam-600 font-medium">
            Subscribed! We'll email you with updates.
          </p>
        ) : (
          <form onSubmit={(e) => void subscribe(e)} className="flex gap-2">
            <input
              type="email"
              required
              value={subEmail}
              onChange={(e) => setSubEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
            />
            <button
              type="submit"
              disabled={subLoading}
              className="rounded-lg bg-seafoam-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-seafoam-600 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              Subscribe to updates
            </button>
          </form>
        )}
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
      <p className="text-slate-600 mb-6">
        Get notified when Sweepr launches and for important status updates.
      </p>
      {done ? (
        <p className="text-seafoam-600 font-semibold">You're subscribed!</p>
      ) : (
        <form
          onSubmit={(e) => void subscribe(e)}
          className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400 bg-white"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-seafoam-500 px-5 py-2 text-sm font-semibold text-white hover:bg-seafoam-600 disabled:opacity-50 transition-colors"
          >
            {loading ? "…" : "Subscribe"}
          </button>
        </form>
      )}
    </section>
  );
}

export default function App() {
  const [data, setData] = useState<StatusData | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchStatus() {
    try {
      const res = await fetch(`${API_URL}/status`);
      if (res.ok) {
        setData(await res.json() as StatusData);
      }
    } catch {
      // network error — keep showing previous data
    }
  }

  useEffect(() => {
    void fetchStatus();
    intervalRef.current = setInterval(() => void fetchStatus(), 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const hasActiveIncidents = (data?.incidents ?? []).length > 0;
  const hasCritical = data?.incidents.some((i) => i.severity === "critical") ?? false;
  const hasMajor = data?.incidents.some((i) => i.severity === "major") ?? false;

  let overallStatus: { label: string; color: string; dot: string };
  if (!data) {
    overallStatus = { label: "Loading…", color: "text-slate-500", dot: "bg-slate-300" };
  } else if (!hasActiveIncidents) {
    overallStatus = { label: "All Systems Operational", color: "text-green-700", dot: "bg-green-500" };
  } else if (hasCritical) {
    overallStatus = { label: "Major Outage", color: "text-red-700", dot: "bg-red-500" };
  } else if (hasMajor) {
    overallStatus = { label: "Major Outage", color: "text-red-700", dot: "bg-red-500" };
  } else {
    overallStatus = { label: "Degraded Performance", color: "text-yellow-700", dot: "bg-yellow-400" };
  }

  const isPrelaunch =
    (data?.settings.prelaunch_cleaner ?? false) ||
    (data?.settings.prelaunch_customer ?? false);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <img src="/brand/sweepr-logo.png" className="h-14 w-auto" alt="Sweepr" />
          <a
            href="https://getsweepr.com"
            className="text-sm text-slate-500 hover:text-seafoam-600 transition-colors"
          >
            getsweepr.com
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        {/* Prelaunch Banner */}
        {isPrelaunch && (
          <div className="mb-8 rounded-xl border border-purple-100 bg-purple-50 px-6 py-4 text-center">
            <p className="text-sm font-semibold text-purple-700">
              Sweepr is coming soon. Follow along below.
            </p>
          </div>
        )}

        {/* Overall Status */}
        <div className="mb-8 rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${overallStatus.dot} animate-pulse`}
            />
            <h1 className={`text-xl font-bold ${overallStatus.color}`}>
              {overallStatus.label}
            </h1>
          </div>
          {data && (
            <p className="mt-1 text-sm text-slate-400">
              Last updated {new Date().toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Active Incidents */}
        {data && data.incidents.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Active Incidents
            </h2>
            <div className="space-y-4">
              {data.incidents.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} />
              ))}
            </div>
          </section>
        )}

        {data && data.incidents.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-8 text-center text-slate-500">
            <p className="text-sm">No active incidents. Everything is running smoothly.</p>
          </div>
        )}

        <NewsletterSection />
      </main>

      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-6">
          <img src="/brand/sweepr-logo.png" className="h-10 w-auto opacity-60" alt="Sweepr" />
          <p className="text-xs text-slate-400">
            &copy; {new Date().getFullYear()} Sweepr, Inc.
          </p>
        </div>
      </footer>
    </div>
  );
}
