import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { ShieldAlert, RefreshCw, History, Clock, Sparkles, CheckCircle2, Languages, Radio } from "lucide-react";
import { DashboardShell, Card, Badge, Select, Input, EmptyState, toast } from "@sweepr/ui";
import { SecurityEventsFeed } from "../components/tickets/SecurityEventsFeed";
import { ReporterContextPanel, type TicketContext } from "../components/tickets/ReporterContextPanel";
import { TelemetryPanel } from "../components/tickets/TelemetryPanel";
import { EmailReporterButton } from "../components/tickets/EmailReporterButton";
import { TemplatePicker, useResponseTemplates, fillPlaceholders } from "../components/tickets/TemplatePicker";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Ticket {
  id: string; case_code: string | null; ticket_id: string | null; sender_email: string; sender_name: string | null;
  subject: string | null; classification: string; status: string; assigned_to: string | null;
  received_at: string; last_reply_at: string | null; auto_reply_sent_at: string | null;
  classification_confidence?: number | null; classification_signals?: string[] | null; auto_classified?: boolean | null;
  reporter_ip?: string | null; reporter_user_agent?: string | null;
  reporter_geo?: Record<string, unknown> | string | null; reporter_device?: Record<string, unknown> | string | null;
  telemetry_consent?: boolean | null;
}
interface Message {
  id: string; direction: string; from_email: string | null; subject: string | null;
  body: string | null; created_at: string; delivery_status: string | null;
}

const STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "error"> = {
  Active: "warning", "Pending Review": "info", "Awaiting Response": "info", Investigating: "info",
  "Information Requested": "info", Resolved: "success", Closed: "success",
  Rejected: "error", Duplicate: "error", "Unable to Reproduce": "error",
};

type Tab = "threats" | "reports";

export function SecurityPage() {
  const { getToken } = useAuth();
  const [tab, setTab] = useState<Tab>("threats");

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  }, [getToken]);

  return (
    <DashboardShell
      title="Security"
      description="Live attack telemetry and problem-centric security reports."
    >
      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        <button
          onClick={() => setTab("threats")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === "threats" ? "bg-white text-charcoal shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700"}`}
        >
          <Radio className="h-4 w-4" /> Threats
        </button>
        <button
          onClick={() => setTab("reports")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === "reports" ? "bg-white text-charcoal shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700"}`}
        >
          <ShieldAlert className="h-4 w-4" /> Reports
        </button>
      </div>
      {tab === "threats" ? <SecurityEventsFeed authed={authed} /> : <SecurityReportsTab authed={authed} />}
    </DashboardShell>
  );
}

function SecurityReportsTab({ authed }: { authed: (path: string, init?: RequestInit) => Promise<Response> }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [classifications, setClassifications] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [context, setContext] = useState<TicketContext | null>(null);
  const [emailBody, setEmailBody] = useState("");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<Record<string, boolean>>({});
  const [showTranslated, setShowTranslated] = useState<Record<string, boolean>>({});
  const templates = useResponseTemplates(authed, "security");

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

  async function open(t: Ticket) {
    setActive(t); setEmailBody(""); setContext(null);
    const res = await authed(`/security/tickets/${t.id}`);
    if (res.ok) {
      const d = (await res.json()) as { ticket: Ticket; messages: Message[] };
      if (d.ticket) setActive(d.ticket);
      setMessages(d.messages ?? []);
    }
    const ctx = await authed(`/security/tickets/${t.id}/context`);
    if (ctx.ok) setContext(((await ctx.json()) as { context: TicketContext }).context ?? null);
  }

  async function setStatus(status: string) {
    if (!active) return;
    const res = await authed(`/security/tickets/${active.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (res.ok) { toast.success(`Status set to ${status}.`); await open(active); void load(); }
    else toast.error("Could not update status.");
  }

  return (
    <>
      {tickets.length === 0 && !loading ? (
        <EmptyState icon={<ShieldAlert className="h-10 w-10 text-seafoam-500" />} title="No security reports" description="Inbound email to security@getsweepr.com appears here as problem reports." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr_288px]">
          {/* Ticket list */}
          <Card className="max-h-[78vh] overflow-y-auto p-0">
            <div className="flex items-center gap-2 border-b border-slate-100 p-2 dark:border-slate-800">
              <div className="flex-1"><Input aria-label="Search reports" placeholder="Search Case Code / sender" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <button onClick={() => void load()} aria-label="Refresh reports" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
            <div className="border-b border-slate-100 p-2 dark:border-slate-800">
              <Select aria-label="Filter by status" options={[{ value: "", label: "All statuses" }, ...statuses.map((s) => ({ value: s, label: s }))]} value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            {tickets.map((t) => (
              <button key={t.id} onClick={() => open(t)} className={`block w-full border-b border-slate-100 p-3 text-left dark:border-slate-800 ${active?.id === t.id ? "bg-seafoam-50 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-seafoam-700">{t.case_code ?? "…"}</span>
                  <Badge variant={STATUS_VARIANT[t.status] ?? "info"}>{t.status}</Badge>
                </div>
                <p className="mt-1 truncate text-sm font-medium text-charcoal dark:text-white">{t.subject ?? "(no subject)"}</p>
                <p className="truncate text-xs text-slate-600">{t.sender_email}</p>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
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

          {/* Problem detail */}
          {active ? (
            <div className="space-y-4">
              <Card className="space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-charcoal dark:text-white">{active.subject ?? "(no subject)"}</h3>
                    <p className="text-xs">
                      <span className="font-mono font-semibold text-seafoam-700">{active.case_code ?? "—"}</span>
                      <span className="ml-2 font-mono text-slate-600">Ticket ID: {active.ticket_id ?? "—"}</span>
                    </p>
                    <p className="text-xs text-slate-600">from {active.sender_name ? `${active.sender_name} <${active.sender_email}>` : active.sender_email}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[active.status] ?? "info"}>{active.status}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/50">
                  <Sparkles className="h-3.5 w-3.5 text-seafoam-500" />
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    {active.classification_confidence != null ? "Inferred:" : "Classification:"} {active.classification}
                  </span>
                  {active.classification_confidence != null ? (
                    <>
                      <Badge variant={active.classification_confidence >= 45 ? "success" : "warning"}>{active.classification_confidence}% confidence</Badge>
                      <span className="text-slate-600">{active.auto_classified ? "auto-classified" : "needs review"}</span>
                      {active.classification_signals?.length ? <span className="text-slate-600">· signals: {active.classification_signals.join(", ")}</span> : null}
                    </>
                  ) : (
                    <span className="text-slate-600">manual / pre-inference</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label="Change status"
                    options={statuses.map((s) => ({ value: s, label: s }))}
                    value={active.status}
                    onChange={(e) => void setStatus(e.target.value)}
                    className="!w-48"
                  />
                  <TemplatePicker templates={templates} onSelect={(tpl) => setEmailBody(fillPlaceholders(tpl.body, { case_code: active.case_code, ticket_id: active.ticket_id, classification: active.classification, sender_email: active.sender_email }))} />
                  <EmailReporterButton box="security" to={active.sender_email} caseCode={active.case_code} subject={active.subject} body={emailBody} />
                </div>
              </Card>

              {/* Telemetry (WHO/IP/device) */}
              <Card>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Reporter telemetry</h4>
                <TelemetryPanel source={active} />
              </Card>

              {/* Internal history / comments */}
              <Card>
                <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600"><History className="h-3.5 w-3.5" /> History</h4>
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
                        <div className="mb-1 flex items-center gap-2 text-xs text-slate-600">
                          {isAutoReply ? <Clock className="h-3 w-3 text-blue-500" /> : <History className="h-3 w-3" />}
                          <span>{m.direction.replace(/_/g, " ")}</span>
                          <span>·</span>
                          <span>{new Date(m.created_at).toLocaleString()}</span>
                          {m.delivery_status && <span className="rounded-full bg-slate-100 px-1.5">{m.delivery_status}</span>}
                          {body && (
                            <button
                              onClick={() => handleTranslate(m.id, body)}
                              disabled={translating[m.id]}
                              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-700"
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
                            <p className="mt-2 border-t border-slate-100 pt-2 text-xs italic text-slate-600 dark:border-slate-700">Original: {body}</p>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200">{body}</p>
                        )}
                      </div>
                    );
                  })}
                  {messages.length === 0 && <p className="text-xs text-slate-600">No history yet.</p>}
                </div>
              </Card>
            </div>
          ) : (
            <Card><p className="text-sm text-slate-600">Select a report to see who reported it, what it is, and their telemetry.</p></Card>
          )}

          {/* Context panel */}
          {active && (
            <Card className="max-h-[78vh] space-y-4 overflow-y-auto">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Reporter context</h3>
              <ReporterContextPanel context={context} kind="security" />
            </Card>
          )}
        </div>
      )}
    </>
  );
}
