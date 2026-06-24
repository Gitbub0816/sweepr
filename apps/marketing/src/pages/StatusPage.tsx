import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { MarketingShell, SweeprLogo } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

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
  status: string;
  severity: string;
  affected_features: string[];
  is_prelaunch_update: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  updates: StatusUpdate[];
}

const severityConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  minor: { icon: AlertTriangle, color: "text-amber-500", label: "Minor" },
  major: { icon: AlertTriangle, color: "text-orange-500", label: "Major" },
  critical: { icon: XCircle, color: "text-red-500", label: "Critical" },
};

const statusLabel: Record<string, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

const statusColor: Record<string, string> = {
  investigating: "bg-amber-100 text-amber-700",
  identified: "bg-orange-100 text-orange-700",
  monitoring: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700",
};

function IncidentCard({ incident }: { incident: Incident }) {
  const [open, setOpen] = useState(false);
  const cfg = severityConfig[incident.severity] ?? severityConfig.minor;
  const Icon = cfg.icon;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <button
        className="flex w-full items-start justify-between gap-4 p-5 text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${cfg.color}`} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-charcoal dark:text-white">{incident.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[incident.status] ?? "bg-slate-100 text-slate-700"}`}>
                {statusLabel[incident.status] ?? incident.status}
              </span>
              {incident.affected_features.map((f) => (
                <span key={f} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">{f}</span>
              ))}
            </div>
            <p className="mt-1 text-sm text-slate-500">{incident.summary}</p>
            <p className="mt-1 text-xs text-slate-400">
              {new Date(incident.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-slate-400">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && incident.updates.length > 0 && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 dark:border-slate-700">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Timeline</p>
          <div className="space-y-3">
            {incident.updates.map((u) => (
              <div key={u.id} className="flex gap-3 text-sm">
                <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-seafoam-400" />
                <div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[u.status] ?? "bg-slate-100 text-slate-700"}`}>
                    {statusLabel[u.status] ?? u.status}
                  </span>
                  <p className="mt-1 text-slate-700 dark:text-slate-300">{u.message}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StatusPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/status`)
      .then((r) => r.json() as Promise<{ incidents?: Incident[] }>)
      .then((d) => {
        setIncidents(d.incidents ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const allGood = !loading && incidents.length === 0;

  return (
    <MarketingShell
      navLinks={[
        { label: "Home", href: "/" },
      ]}
      cta={null}
    >
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="mb-2 flex items-center gap-3">
          <SweeprLogo size="sm" />
          <span className="text-slate-400">/</span>
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Status</span>
        </div>

        {loading ? (
          <div className="mt-16 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-seafoam-400 border-t-transparent" />
          </div>
        ) : (
          <>
            <div className={`mt-8 flex items-center gap-3 rounded-2xl p-6 ${allGood ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-amber-50 dark:bg-amber-950/30"}`}>
              {allGood ? (
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-7 w-7 text-amber-500" />
              )}
              <div>
                <p className={`font-bold ${allGood ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}>
                  {allGood ? "All systems operational" : `${incidents.length} active incident${incidents.length !== 1 ? "s" : ""}`}
                </p>
                <p className="text-sm text-slate-500">
                  {allGood
                    ? "No ongoing incidents. Everything is running normally."
                    : "Our team is actively working on the issues below."}
                </p>
              </div>
            </div>

            {incidents.length > 0 && (
              <div className="mt-6 space-y-4">
                {incidents.map((inc) => (
                  <IncidentCard key={inc.id} incident={inc} />
                ))}
              </div>
            )}

            {allGood && (
              <div className="mt-8 flex items-center gap-2 text-sm text-slate-400">
                <Clock className="h-4 w-4" />
                <span>Last checked {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
              </div>
            )}
          </>
        )}
      </div>
    </MarketingShell>
  );
}
