import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { ShieldAlert, RefreshCw, Send, User, Mail, History, Link2, Sparkles } from "lucide-react";
import { DashboardShell, Card, Button, Badge, Select, Input, Textarea, EmptyState, toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Ticket {
  id: string; case_code: string | null; ticket_id: string | null; sender_email: string; sender_name: string | null;
  subject: string | null; classification: string; status: string; assigned_to: string | null;
  received_at: string; last_reply_at: string | null; auto_reply_sent_at: string | null;
  classification_confidence?: number | null; classification_signals?: string[] | null; auto_classified?: boolean | null;
}
interface Message { id: string; direction: string; from_email: string | null; subject: string | null; body: string | null; created_at: string; delivery_status: string | null; }
interface TicketContext {
  user: Record<string, unknown> | null;
  invites: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
  relatedTickets: Array<Record<string, unknown>>;
  error: Record<string, unknown> | null;
}
interface Template { id: string; department: string; key: string; name: string; classification: string | null; subject: string | null; body: string; is_active: boolean; }

const STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "error"> = {
  Active: "warning", "Pending Review": "info", "Awaiting Response": "info", Investigating: "info",
  "Information Requested": "info", Resolved: "success", Closed: "success",
  Rejected: "error", Duplicate: "error", "Unable to Reproduce": "error",
};

function fillPlaceholders(body: string, t: Ticket): string {
  return body
    .replace(/\{\{?\s*case_code\s*\}?\}/gi, t.case_code ?? "")
    .replace(/\{\{?\s*ticket_id\s*\}?\}/gi, t.ticket_id ?? "")
    .replace(/\{\{?\s*classification\s*\}?\}/gi, t.classification ?? "")
    .replace(/\{\{?\s*sender_email\s*\}?\}/gi, t.sender_email ?? "");
}

export function SecurityPage() {
  const { getToken } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [classifications, setClassifications] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [context, setContext] = useState<TicketContext | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [reply, setReply] = useState("");
  const [replyStatus, setReplyStatus] = useState("Awaiting Response");
  const [replyClass, setReplyClass] = useState("");
  const [sending, setSending] = useState(false);

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      if (search) params.set("q", search);
      const res = await authed(`/security/tickets${params.toString() ? `?${params}` : ""}`);
      if (res.ok) {
        const d = (await res.json()) as { tickets: Ticket[]; statuses: string[]; classifications: string[] };
        setTickets(d.tickets ?? []); setStatuses(d.statuses ?? []); setClassifications(d.classifications ?? []);
      }
    } finally { setLoading(false); }
  }, [authed, filter, search]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void (async () => {
      const res = await authed(`/admin/response-templates?department=security`);
      if (res.ok) setTemplates(((await res.json()) as { templates: Template[] }).templates ?? []);
    })();
  }, [authed]);

  async function open(t: Ticket) {
    setReply(""); setReplyStatus("Awaiting Response"); setReplyClass(t.classification); setContext(null);
    const res = await authed(`/security/tickets/${t.id}`);
    if (res.ok) {
      const d = (await res.json()) as { ticket: Ticket; messages: Message[] };
      setActive(d.ticket ?? t);
      setReplyClass(d.ticket?.classification ?? t.classification);
      setMessages(d.messages ?? []);
    } else setActive(t);
    const ctx = await authed(`/security/tickets/${t.id}/context`);
    if (ctx.ok) setContext(((await ctx.json()) as { context: TicketContext }).context ?? null);
  }

  async function send() {
    if (!active || !reply.trim()) return;
    setSending(true);
    try {
      const res = await authed(`/security/tickets/${active.id}/reply`, { method: "POST", body: JSON.stringify({ body: reply, status: replyStatus, classification: replyClass || undefined }) });
      if (res.ok) { toast.success("Reply sent."); setReply(""); await open(active); void load(); }
      else toast.error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Send failed.");
    } finally { setSending(false); }
  }

  return (
    <DashboardShell
      title="Security"
      description="Inbound security reports (security@getsweepr.com). Replies auto-thread back to the reporter."
      actions={
        <div className="flex items-center gap-2">
          <div className="w-52"><Input placeholder="Search Case Code / Ticket ID / sender" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="w-44"><Select options={[{ value: "", label: "All statuses" }, ...statuses.map((s) => ({ value: s, label: s }))]} value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
          <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
        </div>
      }
    >
      {tickets.length === 0 && !loading ? (
        <EmptyState icon={<ShieldAlert className="h-10 w-10 text-seafoam-500" />} title="No security reports" description="Inbound email to security@getsweepr.com appears here as tickets." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr_300px]">
          <Card className="max-h-[72vh] overflow-y-auto p-0">
            {tickets.map((t) => (
              <button key={t.id} onClick={() => open(t)} className={`block w-full border-b border-slate-100 p-3 text-left dark:border-slate-800 ${active?.id === t.id ? "bg-seafoam-50 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-seafoam-700">{t.case_code ?? "…"}</span>
                  <Badge variant={STATUS_VARIANT[t.status] ?? "info"}>{t.status}</Badge>
                </div>
                <p className="mt-1 truncate text-sm font-medium text-charcoal dark:text-white">{t.subject ?? "(no subject)"}</p>
                <p className="truncate text-xs text-slate-400">{t.sender_email} · {t.classification}</p>
              </button>
            ))}
          </Card>

          {active ? (
            <div className="space-y-4">
              <Card>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-charcoal dark:text-white">{active.subject ?? "(no subject)"}</h3>
                    <p className="text-xs">
                      <span className="font-mono font-semibold text-seafoam-700">{active.case_code ?? "—"}</span>
                      <span className="ml-2 font-mono text-slate-400">Ticket ID: {active.ticket_id ?? "—"}</span>
                    </p>
                    <p className="text-xs text-slate-400">from {active.sender_name ? `${active.sender_name} <${active.sender_email}>` : active.sender_email}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[active.status] ?? "info"}>{active.status}</Badge>
                </div>
                {active.classification_confidence != null && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/50">
                    <Sparkles className="h-3.5 w-3.5 text-seafoam-500" />
                    <span className="font-medium text-slate-600 dark:text-slate-300">Inferred: {active.classification}</span>
                    <Badge variant={active.classification_confidence >= 45 ? "success" : "warning"}>{active.classification_confidence}% confidence</Badge>
                    {active.auto_classified ? <span className="text-slate-400">auto-classified</span> : <span className="text-slate-400">needs review</span>}
                    {active.classification_signals?.length ? <span className="text-slate-400">· signals: {active.classification_signals.join(", ")}</span> : null}
                  </div>
                )}
                <div className="space-y-3">
                  {messages.map((m) => (
                    <div key={m.id} className={`rounded-xl border p-3 text-sm ${m.direction === "inbound" ? "border-slate-200 dark:border-slate-700" : "border-seafoam-200 bg-seafoam-50/40 dark:border-slate-700 dark:bg-slate-800"}`}>
                      <p className="mb-1 text-xs text-slate-400">{m.direction.replace(/_/g, " ")} · {new Date(m.created_at).toLocaleString()}{m.delivery_status ? ` · ${m.delivery_status}` : ""}</p>
                      <p className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200">{m.body}</p>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-charcoal dark:text-white">Manual response</h3>
                  {templates.length > 0 && (
                    <div className="w-56">
                      <Select
                        options={[{ value: "", label: "Insert template…" }, ...templates.filter((t) => t.is_active).map((t) => ({ value: t.id, label: t.name }))]}
                        value=""
                        onChange={(e) => {
                          const tpl = templates.find((t) => t.id === e.target.value);
                          if (tpl && active) setReply(fillPlaceholders(tpl.body, active));
                        }}
                      />
                    </div>
                  )}
                </div>
                <Textarea label="Response body" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write the security response. Internal notes are never sent." />
                <div className="grid grid-cols-2 gap-3">
                  <Select label="New status" options={statuses.map((s) => ({ value: s, label: s }))} value={replyStatus} onChange={(e) => setReplyStatus(e.target.value)} />
                  <Select label="Classification" options={classifications.map((s) => ({ value: s, label: s }))} value={replyClass} onChange={(e) => setReplyClass(e.target.value)} />
                </div>
                <Button onClick={send} loading={sending}><Send className="h-4 w-4" /> Send response</Button>
              </Card>
            </div>
          ) : (
            <Card><p className="text-sm text-slate-400">Select a ticket to view the thread and respond.</p></Card>
          )}

          {active && (
            <Card className="max-h-[72vh] space-y-4 overflow-y-auto">
              <h3 className="text-sm font-semibold text-charcoal dark:text-white">Reporter context</h3>
              <ContextPanel context={context} kind="security" />
            </Card>
          )}
        </div>
      )}
    </DashboardShell>
  );
}

export function ContextPanel({ context, kind }: { context: TicketContext | null; kind: "it" | "security" }) {
  if (!context) return <p className="text-xs text-slate-400">Loading…</p>;
  const { user, invites, audit, relatedTickets, error } = context;
  return (
    <div className="space-y-4 text-xs">
      <section>
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-500"><User className="h-3.5 w-3.5" /> Account</p>
        {user ? (
          <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <p className="font-medium text-charcoal dark:text-white">{String(user.email)}</p>
            <p className="text-slate-400">Role: {String(user.role ?? "—")}{user.admin_role ? ` · ${String(user.admin_role)}` : ""}</p>
            <p className="text-slate-400">Joined {user.created_at ? new Date(String(user.created_at)).toLocaleDateString() : "—"}</p>
          </div>
        ) : <p className="text-slate-400">No Sweepr account matches this email.</p>}
      </section>

      {invites.length > 0 && (
        <section>
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-500"><Mail className="h-3.5 w-3.5" /> Admin invites</p>
          {invites.map((inv, i) => (
            <div key={i} className="rounded-lg border border-amber-200 bg-amber-50/50 p-2 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-slate-600 dark:text-slate-300">Invited by <span className="font-medium">{String(inv.inviter_email ?? inv.created_by ?? "unknown")}</span></p>
              <p className="text-slate-400">{inv.created_at ? new Date(String(inv.created_at)).toLocaleString() : ""}{inv.used_at ? " · accepted" : " · pending"}</p>
            </div>
          ))}
        </section>
      )}

      {error && (
        <section>
          <p className="mb-1 font-semibold text-slate-500">Related error</p>
          <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-2 dark:border-slate-700 dark:bg-slate-800">
            <p className="font-mono text-rose-600">{String(error.status_code ?? "")} {String(error.method ?? "")} {String(error.path ?? "")}</p>
            <p className="text-slate-500">{String(error.message ?? "")}</p>
          </div>
        </section>
      )}

      {audit.length > 0 && (
        <section>
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-500"><History className="h-3.5 w-3.5" /> Audit trail</p>
          <div className="space-y-1">
            {audit.slice(0, 10).map((a, i) => (
              <div key={i} className="rounded border border-slate-100 p-1.5 dark:border-slate-800">
                <p className="font-medium text-slate-600 dark:text-slate-300">{String(a.action ?? "")}</p>
                <p className="text-slate-400">{a.actor_email ? `${String(a.actor_email)} · ` : ""}{a.created_at ? new Date(String(a.created_at)).toLocaleString() : ""}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {relatedTickets.length > 0 && (
        <section>
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-500"><Link2 className="h-3.5 w-3.5" /> Related tickets</p>
          {relatedTickets.map((r, i) => (
            <div key={i} className="rounded border border-slate-100 p-1.5 dark:border-slate-800">
              <span className="font-mono font-semibold text-seafoam-700">{String(r.case_code ?? "")}</span>
              <span className="ml-2 text-slate-400">{String((kind === "security" ? r.subject : r.title) ?? "")}</span>
              <span className="ml-1 text-slate-400">· {String(r.status ?? "")}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
