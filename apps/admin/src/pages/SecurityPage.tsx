import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { ShieldAlert, RefreshCw, Send, User, Mail, History, Link2, Sparkles, CheckCircle2, Clock, AlertCircle, Languages } from "lucide-react";
import { DashboardShell, Card, Button, Badge, Select, Input, Textarea, EmptyState, toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Ticket {
  id: string; case_code: string | null; ticket_id: string | null; sender_email: string; sender_name: string | null;
  subject: string | null; classification: string; status: string; assigned_to: string | null;
  received_at: string; last_reply_at: string | null; auto_reply_sent_at: string | null;
  classification_confidence?: number | null; classification_signals?: string[] | null; auto_classified?: boolean | null;
}
interface Message {
  id: string; direction: string; from_email: string | null; subject: string | null;
  body: string | null; created_at: string; delivery_status: string | null;
}
export interface TicketContext {
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
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<Record<string, boolean>>({});
  const [showTranslated, setShowTranslated] = useState<Record<string, boolean>>({});

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  }, [getToken]);

  async function handleTranslate(msgId: string, text: string) {
    if (translations[msgId]) {
      setShowTranslated((s) => ({ ...s, [msgId]: !s[msgId] }));
      return;
    }
    setTranslating((s) => ({ ...s, [msgId]: true }));
    try {
      const res = await authed("/admin/email/translate", { method: "POST", body: JSON.stringify({ text }) });
      const data = (await res.json()) as { translated?: string };
      if (data.translated) {
        setTranslations((s) => ({ ...s, [msgId]: data.translated! }));
        setShowTranslated((s) => ({ ...s, [msgId]: true }));
      }
    } finally {
      setTranslating((s) => ({ ...s, [msgId]: false }));
    }
  }

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
    // Set a minimal active immediately for the list highlight; full data comes from detail fetch
    setActive(t); setReply(""); setReplyStatus("Awaiting Response"); setReplyClass(t.classification); setContext(null);
    const res = await authed(`/security/tickets/${t.id}`);
    if (res.ok) {
      const d = (await res.json()) as { ticket: Ticket; messages: Message[] };
      // Use the full ticket record (includes classification_confidence/signals/auto_classified)
      if (d.ticket) { setActive(d.ticket); setReplyClass(d.ticket.classification); }
      setMessages(d.messages ?? []);
    }
    const ctx = await authed(`/security/tickets/${t.id}/context`);
    if (ctx.ok) setContext(((await ctx.json()) as { context: TicketContext }).context ?? null);
  }

  async function send() {
    if (!active || !reply.trim()) return;
    setSending(true);
    try {
      const res = await authed(`/security/tickets/${active.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ body: reply, status: replyStatus, classification: replyClass || undefined }),
      });
      if (res.ok) { toast.success("Reply sent."); setReply(""); await open(active); void load(); }
      else toast.error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Send failed.");
    } finally { setSending(false); }
  }

  // Auto-reply templates duplicate the initial acknowledgement — warn and filter
  const AUTO_REPLY_KEYS = new Set(["acknowledge"]);
  const usableTemplates = templates.filter((t) => t.is_active && !AUTO_REPLY_KEYS.has(t.key));
  const hasAutoReply = active?.auto_reply_sent_at != null;

  return (
    <DashboardShell
      title="Security"
      description="Inbound security reports (security@getsweepr.com). Replies auto-thread back to the reporter."
      actions={
        <div className="flex items-center gap-2">
          <div className="w-52"><Input placeholder="Search Case Code / Ticket ID / sender" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="w-44"><Select options={[{ value: "", label: "All statuses" }, ...statuses.map((s) => ({ value: s, label: s }))]} value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
          <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      {tickets.length === 0 && !loading ? (
        <EmptyState icon={<ShieldAlert className="h-10 w-10 text-seafoam-500" />} title="No security reports" description="Inbound email to security@getsweepr.com appears here as tickets." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr_288px]">
          {/* Ticket list */}
          <Card className="max-h-[78vh] overflow-y-auto p-0">
            {tickets.map((t) => (
              <button key={t.id} onClick={() => open(t)} className={`block w-full border-b border-slate-100 p-3 text-left dark:border-slate-800 ${active?.id === t.id ? "bg-seafoam-50 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-seafoam-700">{t.case_code ?? "…"}</span>
                  <Badge variant={STATUS_VARIANT[t.status] ?? "info"}>{t.status}</Badge>
                </div>
                <p className="mt-1 truncate text-sm font-medium text-charcoal dark:text-white">{t.subject ?? "(no subject)"}</p>
                <p className="truncate text-xs text-slate-400">{t.sender_email}</p>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                  <span>{t.classification}</span>
                  {t.classification_confidence != null && (
                    <span className={`rounded-full px-1.5 ${t.auto_classified ? "bg-seafoam-100 text-seafoam-700" : "bg-slate-100 text-slate-500"}`}>
                      {t.classification_confidence}%
                    </span>
                  )}
                  {t.auto_reply_sent_at && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                </div>
              </button>
            ))}
          </Card>

          {/* Thread + reply */}
          {active ? (
            <div className="space-y-4">
              {/* Header */}
              <Card className="space-y-2">
                <div className="flex items-start justify-between">
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

                {/* Inference badge — always show something */}
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/50">
                  <Sparkles className="h-3.5 w-3.5 text-seafoam-500" />
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    {active.classification_confidence != null ? "Inferred:" : "Classification:"} {active.classification}
                  </span>
                  {active.classification_confidence != null ? (
                    <>
                      <Badge variant={active.classification_confidence >= 45 ? "success" : "warning"}>{active.classification_confidence}% confidence</Badge>
                      <span className="text-slate-400">{active.auto_classified ? "auto-classified" : "needs review"}</span>
                      {active.classification_signals?.length ? <span className="text-slate-400">· signals: {active.classification_signals.join(", ")}</span> : null}
                    </>
                  ) : (
                    <span className="text-slate-400">manual / pre-inference</span>
                  )}
                </div>

                {/* Auto-reply status */}
                {hasAutoReply && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Auto-reply sent {new Date(active.auto_reply_sent_at!).toLocaleString()}
                  </div>
                )}
              </Card>

              {/* Message thread */}
              <Card>
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Thread</h4>
                <div className="space-y-3">
                  {messages.map((m) => {
                    const isInbound = m.direction === "inbound";
                    const isAutoReply = m.direction === "auto_reply";
                    const body = m.body ?? "";
                    const translated = translations[m.id];
                    const showing = showTranslated[m.id];
                    return (
                      <div key={m.id} className={`rounded-xl border p-3 text-sm ${
                        isInbound ? "border-slate-200 dark:border-slate-700"
                        : isAutoReply ? "border-blue-100 bg-blue-50/40 dark:border-slate-700 dark:bg-slate-800"
                        : "border-seafoam-200 bg-seafoam-50/40 dark:border-slate-700 dark:bg-slate-800"
                      }`}>
                        <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
                          {isAutoReply ? <Clock className="h-3 w-3 text-blue-500" /> : isInbound ? <Mail className="h-3 w-3" /> : <Send className="h-3 w-3 text-seafoam-500" />}
                          <span>{m.direction.replace(/_/g, " ")}</span>
                          <span>·</span>
                          <span>{new Date(m.created_at).toLocaleString()}</span>
                          {m.delivery_status && <span className="rounded-full bg-slate-100 px-1.5">{m.delivery_status}</span>}
                          {body && (
                            <button
                              onClick={() => handleTranslate(m.id, body)}
                              disabled={translating[m.id]}
                              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-700"
                              title={showing ? "Show original" : "Translate to English"}
                            >
                              <Languages className="h-3 w-3" />
                              {translating[m.id] ? "Translating…" : showing ? "Original" : "Translate"}
                            </button>
                          )}
                        </div>
                        {showing && translated ? (
                          <div>
                            <p className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200">{translated}</p>
                            <p className="mt-2 border-t border-slate-100 pt-2 text-xs italic text-slate-400 dark:border-slate-700">Original: {body}</p>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200">{body}</p>
                        )}
                      </div>
                    );
                  })}
                  {messages.length === 0 && <p className="text-xs text-slate-400">No messages yet.</p>}
                </div>
              </Card>

              {/* Reply composer */}
              <Card className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-charcoal dark:text-white">Manual response</h3>
                  {usableTemplates.length > 0 && (
                    <div className="w-56">
                      <Select
                        options={[{ value: "", label: "Insert template…" }, ...usableTemplates.map((t) => ({ value: t.id, label: t.name }))]}
                        value=""
                        onChange={(e) => {
                          const tpl = usableTemplates.find((t) => t.id === e.target.value);
                          if (tpl && active) setReply(fillPlaceholders(tpl.body, active));
                        }}
                      />
                    </div>
                  )}
                </div>
                {hasAutoReply && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Auto-reply already sent. Write a meaningful update, not a repeat acknowledgement.
                  </div>
                )}
                <Textarea
                  label="Response body"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write the security response. Do not disclose investigation details or confirm vulnerabilities exist."
                />
                <div className="grid grid-cols-2 gap-3">
                  <Select label="New status" options={statuses.map((s) => ({ value: s, label: s }))} value={replyStatus} onChange={(e) => setReplyStatus(e.target.value)} />
                  <Select label="Classification" options={classifications.map((s) => ({ value: s, label: s }))} value={replyClass} onChange={(e) => setReplyClass(e.target.value)} />
                </div>
                <Button onClick={send} loading={sending}><Send className="h-4 w-4" /> Send response to {active.sender_email}</Button>
              </Card>
            </div>
          ) : (
            <Card><p className="text-sm text-slate-400">Select a ticket to view the thread and respond.</p></Card>
          )}

          {/* Context panel */}
          {active && (
            <Card className="max-h-[78vh] space-y-4 overflow-y-auto">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Reporter context</h3>
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
      {/* Account */}
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

      {/* Admin invites — key signal for "who invited this person" */}
      {invites.length > 0 && (
        <section>
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-500"><Mail className="h-3.5 w-3.5" /> Admin invites</p>
          {invites.map((inv, i) => (
            <div key={i} className="rounded-lg border border-amber-200 bg-amber-50/50 p-2 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-slate-600 dark:text-slate-300">
                Invited by <span className="font-semibold text-charcoal dark:text-white">{String(inv.inviter_email ?? inv.created_by ?? "unknown")}</span>
              </p>
              <p className="text-slate-400">
                {inv.created_at ? new Date(String(inv.created_at)).toLocaleString() : ""}
                {inv.used_at ? " · accepted" : " · pending"}
                {inv.expires_at && !inv.used_at ? `, expires ${new Date(String(inv.expires_at)).toLocaleDateString()}` : ""}
              </p>
            </div>
          ))}
        </section>
      )}

      {/* Related error */}
      {error && (
        <section>
          <p className="mb-1 font-semibold text-slate-500">Related error</p>
          <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-2 dark:border-slate-700 dark:bg-slate-800">
            <p className="font-mono text-rose-600">{String(error.status_code ?? "")} {String(error.method ?? "")} {String(error.path ?? "")}</p>
            <p className="text-slate-500">{String(error.message ?? "")}</p>
            <p className="text-slate-400">{error.occurred_at ? new Date(String(error.occurred_at)).toLocaleString() : ""}</p>
          </div>
        </section>
      )}

      {/* Audit trail */}
      {audit.length > 0 && (
        <section>
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-500"><History className="h-3.5 w-3.5" /> Audit trail</p>
          <div className="space-y-1">
            {audit.slice(0, 10).map((a, i) => (
              <div key={i} className="rounded border border-slate-100 p-1.5 dark:border-slate-800">
                <p className="font-medium text-slate-600 dark:text-slate-300">{String(a.action ?? "")}</p>
                <p className="text-slate-400">
                  {a.actor_email ? `${String(a.actor_email)} · ` : ""}
                  {a.created_at ? new Date(String(a.created_at)).toLocaleString() : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Related tickets */}
      {relatedTickets.length > 0 && (
        <section>
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-500"><Link2 className="h-3.5 w-3.5" /> Other tickets</p>
          {relatedTickets.map((r, i) => (
            <div key={i} className="rounded border border-slate-100 p-1.5 dark:border-slate-800">
              <span className="font-mono font-semibold text-seafoam-700">{String(r.case_code ?? "")}</span>
              <span className="ml-2 text-slate-600">{String((kind === "security" ? r.subject : r.title) ?? "")}</span>
              <span className="ml-1 text-slate-400">· {String(r.status ?? "")}</span>
            </div>
          ))}
        </section>
      )}

      {/* Nothing found */}
      {!user && invites.length === 0 && audit.length === 0 && relatedTickets.length === 0 && !error && (
        <p className="text-slate-400">No related account, invite, audit, or ticket history found for this email.</p>
      )}
    </div>
  );
}
