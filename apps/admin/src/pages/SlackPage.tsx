import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { Slack, Hash, Lock, MessageSquare, Send, RefreshCw, CornerDownRight } from "lucide-react";
import { DashboardShell, Card, Button, Badge, Input, toast } from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Me { workspaceConnected: boolean; workspaceName: string | null; userConnected: boolean; }
interface Channel { id: string; name: string | null; is_private: boolean; is_im: boolean; is_mpim: boolean; }
interface Message {
  ts: string; text: string; author: string; avatar: string;
  reply_count: number; thread_ts: string | null;
  reactions: Array<{ name: string; count: number }>;
  approvalProposalId: string | null;
}

export function SlackPage() {
  const { getToken } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState<Message | null>(null);
  const [threadMsgs, setThreadMsgs] = useState<Message[]>([]);
  const [threadDraft, setThreadDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  }, [getToken]);

  const loadMe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authed("/slack/workspace/me");
      if (res.ok) setMe(await res.json() as Me);
    } finally { setLoading(false); }
  }, [authed]);

  const loadChannels = useCallback(async () => {
    const res = await authed("/slack/workspace/my-channels");
    if (res.ok) {
      const ch = ((await res.json()) as { channels: Channel[] }).channels ?? [];
      setChannels(ch);
      if (!active && ch[0]) setActive(ch[0]);
    }
  }, [authed, active]);

  const loadMessages = useCallback(async (ch: Channel) => {
    setLoadingMsgs(true);
    try {
      const res = await authed(`/slack/workspace/history?channel=${ch.id}`);
      if (res.ok) setMessages(((await res.json()) as { messages: Message[] }).messages ?? []);
      else setMessages([]);
    } finally { setLoadingMsgs(false); }
  }, [authed]);

  useEffect(() => { void loadMe(); }, [loadMe]);
  useEffect(() => { if (me?.userConnected) void loadChannels(); }, [me, loadChannels]);
  useEffect(() => { if (active) void loadMessages(active); }, [active, loadMessages]);
  useEffect(() => { bottomRef.current?.scrollIntoView(); }, [messages]);

  async function connectAccount() {
    const res = await authed("/slack/connect");
    if (!res.ok) return toast.error("Could not start Slack connect.");
    window.location.href = ((await res.json()) as { url: string }).url;
  }

  async function send() {
    if (!active || !draft.trim()) return;
    const res = await authed("/slack/workspace/message", { method: "POST", body: JSON.stringify({ channel: active.id, text: draft }) });
    if (res.ok) { setDraft(""); void loadMessages(active); }
    else {
      const body = await res.json().catch(() => ({})) as { error?: string };
      toast.error(`Could not send message${body.error ? `: ${body.error}` : ""}.`);
    }
  }

  async function openThread(m: Message) {
    if (!active) return;
    setThread(m);
    const res = await authed(`/slack/workspace/replies?channel=${active.id}&ts=${m.thread_ts ?? m.ts}`);
    if (res.ok) setThreadMsgs(((await res.json()) as { messages: Message[] }).messages ?? []);
  }

  async function sendThread() {
    if (!active || !thread || !threadDraft.trim()) return;
    const res = await authed("/slack/workspace/message", { method: "POST", body: JSON.stringify({ channel: active.id, text: threadDraft, thread_ts: thread.thread_ts ?? thread.ts }) });
    if (res.ok) { setThreadDraft(""); void openThread(thread); }
    else toast.error("Could not reply.");
  }

  async function approvalAction(proposalId: string, verb: string) {
    const res = await authed(`/admin/fee-proposals/${proposalId}/${verb}`, { method: "POST", body: JSON.stringify({}) });
    if (res.ok) { toast.success(`Done: ${verb.replace(/-/g, " ")}`); if (active) void loadMessages(active); }
    else toast.error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Action failed.");
  }

  // ── Gates ────────────────────────────────────────────────────────────────
  if (loading) {
    return <DashboardShell title="Slack"><div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></DashboardShell>;
  }
  if (!me?.workspaceConnected) {
    return (
      <DashboardShell title="Slack" description="Embedded Slack workspace.">
        <Card className="max-w-lg space-y-3">
          <p className="text-sm text-slate-500">No Slack workspace is connected yet. Connect one under{" "}
            <Link to="/settings" className="text-seafoam-600 underline">Settings → Slack</Link>.</p>
        </Card>
      </DashboardShell>
    );
  }
  if (!me.userConnected) {
    return (
      <DashboardShell title="Slack" description={`Workspace: ${me.workspaceName ?? ""}`}>
        <Card className="max-w-lg space-y-3">
          <div className="flex items-center gap-2"><Slack className="h-5 w-5 text-seafoam-600" /><h2 className="text-sm font-semibold text-charcoal dark:text-white">Connect your Slack account</h2></div>
          <p className="text-sm text-slate-500">To view and send messages as yourself, connect your personal Slack account. You'll only see channels and DMs your Slack account can access.</p>
          <Button onClick={connectAccount}>Connect my Slack account</Button>
        </Card>
      </DashboardShell>
    );
  }

  const visible = channels.filter((c) => !filter || (c.name ?? "").toLowerCase().includes(filter.toLowerCase()));

  return (
    <DashboardShell
      title="Slack"
      description={`Workspace: ${me.workspaceName ?? ""}`}
      actions={<button onClick={() => active && void loadMessages(active)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>}
    >
      <div className="grid h-[70vh] grid-cols-[220px_1fr] gap-4 lg:grid-cols-[240px_1fr_300px]">
        {/* Channel sidebar */}
        <Card className="flex flex-col overflow-hidden p-0">
          <div className="border-b border-slate-200 p-2 dark:border-slate-700">
            <Input placeholder="Filter channels…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {visible.map((ch) => (
              <button
                key={ch.id}
                onClick={() => { setActive(ch); setThread(null); }}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${active?.id === ch.id ? "bg-seafoam-50 font-medium text-seafoam-700" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300"}`}
              >
                {ch.is_im || ch.is_mpim ? <MessageSquare className="h-3.5 w-3.5" /> : ch.is_private ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
                <span className="truncate">{ch.name ?? (ch.is_im ? "Direct message" : ch.id)}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* Messages */}
        <Card className="flex flex-col overflow-hidden p-0">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {loadingMsgs ? (
              <div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-4 border-seafoam-400 border-t-transparent" /></div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-slate-400">No messages.</p>
            ) : messages.map((m) => (
              <div key={m.ts} className="flex gap-2">
                {m.avatar ? <img src={m.avatar} alt="" className="h-8 w-8 rounded" /> : <div className="h-8 w-8 rounded bg-slate-200 dark:bg-slate-700" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm"><span className="font-semibold text-charcoal dark:text-white">{m.author}</span> <span className="text-xs text-slate-400">{new Date(Number(m.ts.split(".")[0]) * 1000).toLocaleTimeString()}</span></p>
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">{m.text}</p>
                  {m.approvalProposalId && (
                    <div className="mt-2 rounded-xl border border-seafoam-200 bg-seafoam-50/50 p-3 dark:border-slate-700 dark:bg-slate-800">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-seafoam-700">Approval required</p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => approvalAction(m.approvalProposalId!, "approve")}>Approve</Button>
                        <Button size="sm" variant="danger" onClick={() => approvalAction(m.approvalProposalId!, "decline")}>Decline</Button>
                        <Button size="sm" variant="ghost" onClick={() => approvalAction(m.approvalProposalId!, "join-collaboration")}>Join Collaboration</Button>
                        <Link to={`/approvals/${m.approvalProposalId}`}><Button size="sm" variant="secondary">Open in Approval Engine</Button></Link>
                      </div>
                    </div>
                  )}
                  <div className="mt-1 flex items-center gap-3">
                    {m.reactions.length > 0 && <span className="text-xs text-slate-400">{m.reactions.map((r) => `:${r.name}: ${r.count}`).join("  ")}</span>}
                    <button onClick={() => openThread(m)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-seafoam-600">
                      <CornerDownRight className="h-3 w-3" /> {m.reply_count > 0 ? `${m.reply_count} replies` : "Reply"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          {active && (
            <div className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
              <Input className="flex-1" placeholder={`Message ${active?.name ? "#" + active.name : ""}`} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
              <Button onClick={send}><Send className="h-4 w-4" /></Button>
            </div>
          )}
        </Card>

        {/* Thread panel */}
        {thread && (
          <Card className="hidden flex-col overflow-hidden p-0 lg:flex">
            <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-charcoal dark:text-white">Thread</h3>
              <button onClick={() => setThread(null)} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {threadMsgs.map((tm) => (
                <div key={tm.ts}>
                  <p className="text-xs font-semibold text-charcoal dark:text-white">{tm.author}</p>
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">{tm.text}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
              <Input className="flex-1" placeholder="Reply…" value={threadDraft} onChange={(e) => setThreadDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendThread(); } }} />
              <Button onClick={sendThread}><Send className="h-4 w-4" /></Button>
            </div>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
