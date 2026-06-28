import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Server,
  Monitor,
  Copy,
  Check,
} from "lucide-react";

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

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-charcoal">{value}</p>
    </div>
  );
}

export function ErrorsPage() {
  const { getToken } = useAuth();
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"" | "server" | "client">("");
  const [includeResolved, setIncludeResolved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyAll() {
    const text = errors
      .map((e) =>
        [
          `[${new Date(e.occurred_at).toISOString()}] ${e.level.toUpperCase()} ${e.source}${e.app ? `/${e.app}` : ""}`,
          `${e.method ?? ""} ${e.path ?? ""}${e.status_code != null ? ` → ${e.status_code}` : ""}`.trim(),
          e.message,
          e.clerk_id ? `user: ${e.clerk_id}` : "",
          e.request_id ? `ray: ${e.request_id}` : "",
          e.stack ? `\n${e.stack}` : "",
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (sourceFilter) params.set("source", sourceFilter);
      if (includeResolved) params.set("resolved", "true");
      const res = await fetch(`${API}/admin/observability/errors?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as { errors: ErrorRow[]; counts: Counts };
      setErrors(data.errors ?? []);
      setCounts(data.counts ?? null);
    } catch {
      setErrors([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, sourceFilter, includeResolved]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id: string) {
    const token = await getToken();
    await fetch(`${API}/admin/observability/errors/${id}/resolve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  }

  async function createTicket(id: string) {
    const token = await getToken();
    const res = await fetch(`${API}/it-tickets/admin/from-error/${id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const d = (await res.json()) as { ticket?: { ticket_number?: number } };
      alert(`Ticket #${d.ticket?.ticket_number ?? ""} created in IT Portal.`);
      load();
    }
  }

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
            disabled={errors.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy all"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50"
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(["", "server", "client"] as const).map((s) => (
          <button
            key={s || "all"}
            onClick={() => setSourceFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              sourceFilter === s
                ? "bg-charcoal text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {s === "" ? "All sources" : s === "server" ? "Server" : "Client"}
          </button>
        ))}
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
      ) : errors.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
          No errors. Everything's running clean.
        </div>
      ) : (
        <div className="space-y-2">
          {errors.map((e) => (
            <div
              key={e.id}
              className={`rounded-xl border bg-white ${
                e.resolved ? "border-slate-100 opacity-60" : "border-slate-200"
              }`}
            >
              <div className="flex items-start gap-3 p-4">
                <div className="mt-0.5 flex-shrink-0">
                  {e.source === "server" ? (
                    <Server className="h-4 w-4 text-slate-400" />
                  ) : (
                    <Monitor className="h-4 w-4 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_COLOR[e.level] ?? "bg-slate-100 text-slate-500"}`}>
                      {e.level}
                    </span>
                    {e.app && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {e.app}
                      </span>
                    )}
                    {e.status_code != null && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {e.method} {e.status_code}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      {new Date(e.occurred_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1.5 break-words font-mono text-sm text-charcoal">{e.message}</p>
                  {e.path && (
                    <p className="mt-0.5 truncate font-mono text-xs text-slate-400">{e.path}</p>
                  )}
                  {expanded === e.id && e.stack && (
                    <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-300">
                      {e.stack}
                    </pre>
                  )}
                  {expanded === e.id && (
                    <p className="mt-2 text-xs text-slate-400">
                      {e.clerk_id ? `User: ${e.clerk_id} · ` : ""}
                      {e.request_id ? `Ray: ${e.request_id}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-2">
                  {e.stack && (
                    <button
                      onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                    >
                      {expanded === e.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      Stack
                    </button>
                  )}
                  {!e.resolved && (
                    <>
                      <button
                        onClick={() => createTicket(e.id)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Create ticket
                      </button>
                      <button
                        onClick={() => resolve(e.id)}
                        className="rounded-lg bg-seafoam-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-seafoam-600"
                      >
                        Resolve
                      </button>
                    </>
                  )}
                  {e.resolved && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        Errors are captured automatically from the API and every frontend app.
      </p>
    </div>
  );
}
