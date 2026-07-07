/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  X,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Globe,
  User,
  ListTree,
  Monitor,
  FileJson,
  Ticket,
  CheckCircle2,
  RotateCcw,
  Layers,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

// ─── Types (defensive: old rows have none of this) ──────────────────────────

interface ErrContextErr {
  name?: string;
  message?: string;
  stack?: string;
  cause?: ErrContextErr;
}

interface PgContext {
  code?: string;
  detail?: string;
  hint?: string;
  table?: string;
  column?: string;
  constraint?: string;
  schema?: string;
  severity?: string;
  routine?: string;
  position?: string;
}

interface RequestContext {
  path?: string;
  method?: string;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  bodySnippet?: string | null;
  ip?: string;
  cfRay?: string;
  colo?: string;
  country?: string;
  userAgent?: string;
  client?: {
    url?: string;
    componentStack?: string;
    appVersion?: string;
    viewport?: string;
    language?: string;
    online?: boolean;
  };
}

interface Breadcrumb {
  ts?: string;
  level?: string;
  msg?: string;
  data?: unknown;
}

export interface ErrorContextV2 {
  v?: number;
  err?: ErrContextErr;
  pg?: PgContext | null;
  request?: RequestContext;
  user?: { clerkId?: string | null; userId?: string | null; role?: string | null };
  runtime?: { environment?: string; worker?: string };
  timing?: { startedAt?: string; durationMs?: number };
  breadcrumbs?: Breadcrumb[];
  logData?: unknown;
}

export interface ErrorDetail {
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
  resolved_by: string | null;
  fingerprint: string | null;
  reference_id: string | null;
  error_name: string | null;
  error_code: string | null;
  duration_ms: number | null;
  context: ErrorContextV2 | null;
}

const LEVEL_COLOR: Record<string, string> = {
  fatal: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
  warn: "bg-amber-100 text-amber-700",
  info: "bg-blue-100 text-blue-700",
};

const BREADCRUMB_DOT: Record<string, string> = {
  error: "bg-red-500",
  fatal: "bg-red-500",
  warn: "bg-amber-500",
  info: "bg-blue-500",
};

function relativeTime(iso: string): string {
  const secondsAgo = Math.abs(Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secondsAgo < 60) return "just now";
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  return `${Math.floor(secondsAgo / 86400)}d ago`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500"
    >
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Section({
  title,
  icon: Icon,
  defaultOpen = true,
  emphasize = false,
  children,
}: {
  title: string;
  icon: typeof Database;
  defaultOpen?: boolean;
  emphasize?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`rounded-xl border ${
        emphasize ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500"
      >
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="border-t border-slate-100 px-4 py-3">{children}</div>}
    </div>
  );
}

function DefRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-slate-100 py-1.5 text-xs last:border-0">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="col-span-2 break-words font-mono text-slate-700">{String(value)}</dd>
    </div>
  );
}

function KVTable({ data }: { data: Record<string, unknown> | undefined | null }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-xs text-slate-400">None</p>;
  }
  return (
    <table className="w-full text-left text-xs">
      <tbody>
        {Object.entries(data).map(([k, v]) => (
          <tr key={k} className="border-b border-slate-50 last:border-0">
            <td className="py-1 pr-3 align-top font-medium text-slate-500">{k}</td>
            <td className="py-1 break-all font-mono text-slate-700">
              {typeof v === "object" ? JSON.stringify(v) : String(v)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CauseChain({ err, depth = 0 }: { err: ErrContextErr; depth?: number }) {
  return (
    <div className={depth > 0 ? "mt-3 border-l-2 border-slate-200 pl-3" : ""}>
      <p className="text-xs font-semibold text-slate-600">
        {depth > 0 ? "Caused by: " : ""}
        {err.name ?? "Error"}
        {err.message ? ` — ${err.message}` : ""}
      </p>
      {err.stack && (
        <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300">
          {err.stack}
        </pre>
      )}
      {err.cause && <CauseChain err={err.cause} depth={depth + 1} />}
    </div>
  );
}

export function ErrorDetailDrawer({
  id,
  onClose,
  onResolved,
  onViewGroup,
}: {
  id: string;
  onClose: () => void;
  onResolved: () => void;
  onViewGroup: (fingerprint: string) => void;
}) {
  const { getToken } = useAuth();
  const [detail, setDetail] = useState<ErrorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(`${API}/admin/observability/errors/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { error: ErrorDetail };
        if (!cancelled) setDetail(data.error);
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, getToken]);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toggleResolve() {
    if (!detail) return;
    setBusy(true);
    try {
      const token = await getToken();
      await fetch(`${API}/admin/observability/errors/${detail.id}/${detail.resolved ? "unresolve" : "resolve"}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setDetail((d) => (d ? { ...d, resolved: !d.resolved } : d));
      onResolved();
    } finally {
      setBusy(false);
    }
  }

  async function createTicket() {
    if (!detail) return;
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/it-tickets/admin/from-error/${detail.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = (await res.json()) as { ticket?: { ticket_number?: number } };
        alert(`Ticket #${d.ticket?.ticket_number ?? ""} created in IT Portal.`);
      }
    } finally {
      setBusy(false);
    }
  }

  const ctx = detail?.context ?? null;
  const pg = ctx?.pg;
  const req = ctx?.request;
  const user = ctx?.user;
  const breadcrumbs = ctx?.breadcrumbs ?? [];
  const client = req?.client;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Error details"
        className="flex h-full w-full max-w-3xl flex-col bg-offwhite shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
          <div className="min-w-0">
            {detail && (
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_COLOR[detail.level] ?? "bg-slate-100 text-slate-500"}`}>
                  {detail.level}
                </span>
                {detail.error_name && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {detail.error_name}
                  </span>
                )}
                {detail.error_code && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-600">
                    {detail.error_code}
                  </span>
                )}
                {detail.resolved && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" /> Resolved
                  </span>
                )}
              </div>
            )}
            <h2 className="break-words text-sm font-bold text-charcoal">
              {loading ? "Loading…" : detail?.message ?? "Not found"}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close error details"
            className="flex-shrink-0 rounded-md p-1 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="h-40 animate-pulse rounded-xl bg-slate-100" />}
          {!loading && !detail && (
            <p className="p-6 text-center text-sm text-slate-500">Couldn't load this error.</p>
          )}
          {!loading && detail && (
            <div className="space-y-3">
              {/* Header details */}
              <Section title="Overview" icon={Layers}>
                <dl>
                  <DefRow
                    label="Reference"
                    value={
                      detail.reference_id ? (
                        <span className="flex items-center gap-2">
                          {detail.reference_id}
                          <CopyButton text={detail.reference_id} label="Copy reference id" />
                        </span>
                      ) : null
                    }
                  />
                  <DefRow
                    label="Fingerprint"
                    value={
                      detail.fingerprint ? (
                        <span className="flex items-center gap-2">
                          {detail.fingerprint}
                          <CopyButton text={detail.fingerprint} label="Copy fingerprint" />
                          <button
                            type="button"
                            onClick={() => onViewGroup(detail.fingerprint as string)}
                            className="text-[11px] font-medium text-seafoam-700 underline hover:text-seafoam-800"
                          >
                            View group
                          </button>
                        </span>
                      ) : null
                    }
                  />
                  <DefRow label="Occurred at" value={`${new Date(detail.occurred_at).toLocaleString()} (${relativeTime(detail.occurred_at)})`} />
                  <DefRow label="App / source" value={[detail.app, detail.source].filter(Boolean).join(" / ")} />
                  <DefRow label="Status code" value={detail.status_code} />
                  <DefRow label="Duration" value={detail.duration_ms != null ? `${detail.duration_ms}ms` : null} />
                  <DefRow label="Request ID" value={detail.request_id} />
                </dl>
              </Section>

              {/* Stack trace */}
              {(detail.stack || ctx?.err?.stack) && (
                <Section title="Stack trace" icon={ListTree}>
                  <pre className="max-h-96 overflow-auto whitespace-pre rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300">
                    {detail.stack ?? ctx?.err?.stack}
                  </pre>
                </Section>
              )}

              {/* Cause chain */}
              {ctx?.err?.cause && (
                <Section title="Cause chain" icon={Layers} defaultOpen={false}>
                  <CauseChain err={ctx.err.cause} />
                </Section>
              )}

              {/* Database error */}
              {pg && (pg.code || pg.detail || pg.table) && (
                <Section title="Database error" icon={Database} emphasize>
                  <dl>
                    <DefRow label="SQLSTATE" value={pg.code} />
                    <DefRow label="Detail" value={pg.detail} />
                    <DefRow label="Hint" value={pg.hint} />
                    <DefRow label="Table" value={pg.table} />
                    <DefRow label="Column" value={pg.column} />
                    <DefRow label="Constraint" value={pg.constraint} />
                    <DefRow label="Schema" value={pg.schema} />
                    <DefRow label="Severity" value={pg.severity} />
                    <DefRow label="Routine" value={pg.routine} />
                    <DefRow label="Position" value={pg.position} />
                  </dl>
                </Section>
              )}

              {/* Request */}
              {(req || detail.path) && (
                <Section title="Request" icon={Globe}>
                  <dl className="mb-3">
                    <DefRow label="Method / path" value={[req?.method ?? detail.method, req?.path ?? detail.path].filter(Boolean).join(" ")} />
                    <DefRow label="IP" value={req?.ip} />
                    <DefRow label="CF-Ray" value={req?.cfRay} />
                    <DefRow label="Colo" value={req?.colo} />
                    <DefRow label="Country" value={req?.country} />
                    <DefRow label="User agent" value={req?.userAgent} />
                  </dl>
                  {req?.query && Object.keys(req.query).length > 0 && (
                    <div className="mb-3">
                      <p className="mb-1 text-[11px] font-semibold uppercase text-slate-400">Query params</p>
                      <KVTable data={req.query} />
                    </div>
                  )}
                  {req?.headers && Object.keys(req.headers).length > 0 && (
                    <div className="mb-3">
                      <p className="mb-1 text-[11px] font-semibold uppercase text-slate-400">Headers</p>
                      <KVTable data={req.headers} />
                    </div>
                  )}
                  {req?.bodySnippet && (
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase text-slate-400">Body snippet</p>
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300">
                        {req.bodySnippet}
                      </pre>
                    </div>
                  )}
                </Section>
              )}

              {/* User */}
              {(user || detail.clerk_id) && (
                <Section title="User" icon={User} defaultOpen={false}>
                  <dl>
                    <DefRow label="Clerk ID" value={user?.clerkId ?? detail.clerk_id} />
                    <DefRow label="User ID" value={user?.userId} />
                    <DefRow label="Role" value={user?.role} />
                  </dl>
                </Section>
              )}

              {/* Breadcrumbs */}
              {breadcrumbs.length > 0 && (
                <Section title={`Breadcrumbs (${breadcrumbs.length})`} icon={ListTree} defaultOpen={false}>
                  <BreadcrumbTimeline breadcrumbs={breadcrumbs} />
                </Section>
              )}

              {/* Client */}
              {client && (
                <Section title="Client" icon={Monitor} defaultOpen={false}>
                  <dl>
                    <DefRow label="URL" value={client.url} />
                    <DefRow label="Viewport" value={client.viewport} />
                    <DefRow label="Language" value={client.language} />
                    <DefRow label="Online" value={client.online != null ? String(client.online) : null} />
                    <DefRow label="App version" value={client.appVersion} />
                  </dl>
                  {client.componentStack && (
                    <div className="mt-2">
                      <p className="mb-1 text-[11px] font-semibold uppercase text-slate-400">Component stack</p>
                      <pre className="max-h-56 overflow-auto whitespace-pre rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300">
                        {client.componentStack}
                      </pre>
                    </div>
                  )}
                </Section>
              )}

              {/* Raw JSON */}
              <Section title="Raw context JSON" icon={FileJson} defaultOpen={false}>
                <div className="mb-2 flex justify-end">
                  <CopyButton text={JSON.stringify(detail, null, 2)} label="Copy full JSON" />
                </div>
                <pre className="max-h-96 overflow-auto whitespace-pre rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300">
                  {JSON.stringify(detail, null, 2)}
                </pre>
              </Section>
            </div>
          )}
        </div>

        {/* Actions */}
        {detail && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 py-3">
            <button
              type="button"
              onClick={toggleResolve}
              disabled={busy}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
                detail.resolved ? "bg-slate-500 hover:bg-slate-600" : "bg-seafoam-500 hover:bg-seafoam-600"
              }`}
            >
              {detail.resolved ? <RotateCcw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {detail.resolved ? "Unresolve" : "Resolve"}
            </button>
            <button
              type="button"
              onClick={createTicket}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <Ticket className="h-3.5 w-3.5" />
              Create IT ticket
            </button>
            {detail.fingerprint && (
              <button
                type="button"
                onClick={() => onViewGroup(detail.fingerprint as string)}
                className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <Layers className="h-3.5 w-3.5" />
                View group
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BreadcrumbTimeline({ breadcrumbs }: { breadcrumbs: Breadcrumb[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <ol className="space-y-0">
      {breadcrumbs.map((b, i) => (
        <li key={i} className="relative flex gap-3 pb-3 pl-1 last:pb-0">
          <div className="flex flex-col items-center">
            <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${BREADCRUMB_DOT[b.level ?? ""] ?? "bg-slate-300"}`} />
            {i < breadcrumbs.length - 1 && <span className="mt-0.5 w-px flex-1 bg-slate-200" />}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[11px] text-slate-400">
                {b.ts ? new Date(b.ts).toLocaleTimeString() : ""}
              </span>
              <span className="text-xs text-slate-700">{b.msg ?? ""}</span>
            </div>
            {b.data != null && (
              <button
                type="button"
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="mt-0.5 text-[11px] font-medium text-seafoam-700 underline hover:text-seafoam-800"
              >
                {openIdx === i ? "Hide data" : "Show data"}
              </button>
            )}
            {openIdx === i && b.data != null && (
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre rounded-lg bg-slate-950 p-2 text-[11px] leading-relaxed text-slate-300">
                {JSON.stringify(b.data, null, 2)}
              </pre>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
