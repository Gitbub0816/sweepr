import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { ShieldAlert, RefreshCw, Send } from "lucide-react";
import { DashboardShell, Card, Button, Badge, Select, Textarea, EmptyState, toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Ticket {
  id: string; ticket_number: string | null; sender_email: string; sender_name: string | null;
  subject: string | null; classification: string; status: string; assigned_to: string | null;
  received_at: string; last_reply_at: string | null; auto_reply_sent_at: string | null;
}
interface Message { id: string; direction: string; from_email: string | null; subject: string | null; body: string | null; created_at: string; delivery_status: string | null; }

const STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "error"> = {
  Active: "warning", "Pending Review": "info", "Awaiting Response": "info", Investigating: "info",
  "Information Requested": "info", Resolved: "success", Closed: "success",
  Rejected: "error", Duplicate: "error", "Unable to Reproduce": "error",
};

export function SecurityPage() {
  const { getToken } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [classifications, setClassifications] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
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
      const res = await authed(`/security/tickets${filter ? `?status=${encodeURIComponent(filter)}` : ""}`);
      if (res.ok) {
        const d = (await res.json()) as { tickets: Ticket[]; statuses: string[]; classifications: string[] };
        setTickets(d.tickets ?? []); setStatuses(d.statuses ?? []); setClassifications(d.classifications ?? []);
      }
    } finally { setLoading(false); }
  }, [authed, filter]);

  useEffect(() => { void load(); }, [load]);

  async function open(t: Ticket) {
    setActive(t); setReply(""); setReplyStatus("Awaiting Response"); setReplyClass(t.classification);
    const res = await authed(`/security/tickets/${t.id}`);
    if (res.ok) setMessages(((await res.json()) as { messages: Message[] }).messages ?? []);
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
          <div className="w-44"><Select options={[{ value: "", label: "All statuses" }, ...statuses.map((s) => ({ value: s, label: s }))]} value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
          <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
        </div>
      }
    >
      {tickets.length === 0 && !loading ? (
        <EmptyState icon={<ShieldAlert className="h-10 w-10 text-seafoam-500" />} title="No security reports" description="Inbound email to security@getsweepr.com appears here as tickets." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card className="max-h-[72vh] overflow-y-auto p-0">
            {tickets.map((t) => (
              <button key={t.id} onClick={() => open(t)} className={`block w-full border-b border-slate-100 p-3 text-left dark:border-slate-800 ${active?.id === t.id ? "bg-seafoam-50 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-500">{t.ticket_number ?? "…"}</span>
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
                    <p className="text-xs text-slate-400">{active.ticket_number} · from {active.sender_name ? `${active.sender_name} <${active.sender_email}>` : active.sender_email}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[active.status] ?? "info"}>{active.status}</Badge>
                </div>
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
                <h3 className="text-sm font-semibold text-charcoal dark:text-white">Manual response</h3>
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
        </div>
      )}
    </DashboardShell>
  );
}
