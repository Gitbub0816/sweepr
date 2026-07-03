import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Card, Button, Input, toast } from "@sweepr/ui";
import { Inbox, Send, RotateCw, Reply, PenSquare, ShieldCheck, Trash2, MailOpen, Mail as MailIcon } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Box { id: string; address: string; name: string; unread: number; total: number }
interface Message {
  id: string;
  direction: "inbound" | "outbound";
  sender_email: string;
  sender_name: string | null;
  to_email: string | null;
  subject: string;
  body_text: string;
  in_reply_to: string | null;
  read_at: string | null;
  created_at: string;
  sent_by_email: string | null;
}
interface Grant { id: string; user_id: string; mailbox: string; email: string; granted_by_email: string | null }
interface AdminUser { id: string; email: string; role: string; admin_role: string | null }

export function MailPage() {
  const { getToken } = useAuth();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [activeBox, setActiveBox] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);

  // Compose state (doubles as reply when replyTo is set)
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // Permissions (super_admin only — section hides itself on 403)
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [permBoxes, setPermBoxes] = useState<string[]>([]);
  const [grantUser, setGrantUser] = useState("");
  const [grantBox, setGrantBox] = useState("");

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  }, [getToken]);

  const loadBoxes = useCallback(async () => {
    const res = await authed("/admin/mail/boxes");
    if (!res.ok) { setLoading(false); return; }
    const data = (await res.json()) as { boxes: Box[] };
    setBoxes(data.boxes);
    setActiveBox((prev) => prev ?? data.boxes[0]?.id ?? null);
    setLoading(false);
  }, [authed]);

  const loadMessages = useCallback(async (box: string) => {
    const res = await authed(`/admin/mail/${box}/messages`);
    if (!res.ok) return;
    const data = (await res.json()) as { messages: Message[] };
    setMessages(data.messages);
  }, [authed]);

  const loadPermissions = useCallback(async () => {
    const res = await authed("/admin/mail/permissions");
    if (!res.ok) { setGrants(null); return; } // 403 → not super_admin, hide section
    const data = (await res.json()) as { grants: Grant[]; admins: AdminUser[]; mailboxes: string[] };
    setGrants(data.grants);
    setAdmins(data.admins);
    setPermBoxes(data.mailboxes);
  }, [authed]);

  useEffect(() => { void loadBoxes(); void loadPermissions(); }, [loadBoxes, loadPermissions]);
  useEffect(() => { if (activeBox) void loadMessages(activeBox); }, [activeBox, loadMessages]);

  async function openMessage(m: Message) {
    setSelected(m);
    setComposeOpen(false);
    if (m.direction === "inbound" && !m.read_at && activeBox) {
      await authed(`/admin/mail/${activeBox}/messages/${m.id}/read`, { method: "POST" });
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setBoxes((prev) => prev.map((b) => (b.id === activeBox ? { ...b, unread: Math.max(0, b.unread - 1) } : b)));
    }
  }

  function startReply(m: Message) {
    setReplyTo(m);
    setTo(m.direction === "inbound" ? m.sender_email : (m.to_email ?? ""));
    setSubject(m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`);
    setBody("");
    setComposeOpen(true);
  }

  function startCompose() {
    setReplyTo(null);
    setTo("");
    setSubject("");
    setBody("");
    setSelected(null);
    setComposeOpen(true);
  }

  async function handleSend() {
    if (!activeBox) return;
    if (!to.trim() || !subject.trim() || !body.trim()) { toast.error("To, subject and body are required"); return; }
    setSending(true);
    try {
      const res = await authed(`/admin/mail/${activeBox}/send`, {
        method: "POST",
        body: JSON.stringify({ to, subject, body, ...(replyTo ? { inReplyTo: replyTo.id } : {}) }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "Send failed");
      toast.success(`Sent from ${activeBox}@getsweepr.com`);
      setComposeOpen(false);
      void loadMessages(activeBox);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function addGrant() {
    if (!grantUser || !grantBox) { toast.error("Pick an admin and a mailbox"); return; }
    const res = await authed("/admin/mail/permissions", {
      method: "POST",
      body: JSON.stringify({ userId: grantUser, mailbox: grantBox }),
    });
    if (res.ok) { toast.success("Access granted"); void loadPermissions(); }
    else toast.error("Grant failed");
  }

  async function removeGrant(id: string) {
    const res = await authed(`/admin/mail/permissions/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Access revoked"); void loadPermissions(); }
  }

  const fmtDate = (s: string) => new Date(s).toLocaleString();

  if (loading) return <div className="p-8 text-slate-600">Loading mail…</div>;

  if (boxes.length === 0) {
    return (
      <Card className="m-6 p-8 text-center text-slate-500">
        <Inbox className="mx-auto mb-3 h-8 w-8" />
        You don't have access to any mailboxes. Ask a super admin to grant you one.
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-charcoal dark:text-white">Mail</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { void loadBoxes(); if (activeBox) void loadMessages(activeBox); }}>
            <RotateCw className="mr-1 h-4 w-4" /> Refresh
          </Button>
          <Button onClick={startCompose}>
            <PenSquare className="mr-1 h-4 w-4" /> Compose
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Mailbox list */}
        <Card className="col-span-3 p-2">
          {boxes.map((b) => (
            <button
              key={b.id}
              onClick={() => { setActiveBox(b.id); setSelected(null); setComposeOpen(false); }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                activeBox === b.id ? "bg-seafoam-100 font-semibold text-seafoam-900 dark:bg-seafoam-900/30 dark:text-seafoam-100" : "hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              <span className="truncate">
                <span className="block">{b.name}</span>
                <span className="block text-xs font-normal text-slate-600">{b.address}</span>
              </span>
              {b.unread > 0 && (
                <span className="ml-2 rounded-full bg-seafoam-500 px-2 py-0.5 text-xs font-bold text-white">{b.unread}</span>
              )}
            </button>
          ))}
        </Card>

        {/* Message list */}
        <Card className="col-span-4 max-h-[70vh] overflow-y-auto p-2">
          {messages.length === 0 && <p className="p-4 text-sm text-slate-600">No messages yet.</p>}
          {messages.map((m) => (
            <button
              key={m.id}
              onClick={() => void openMessage(m)}
              className={`block w-full rounded-lg px-3 py-2 text-left ${
                selected?.id === m.id ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
            >
              <div className="flex items-center gap-2">
                {m.direction === "outbound"
                  ? <Send className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                  : m.read_at
                    ? <MailOpen className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                    : <MailIcon className="h-3.5 w-3.5 shrink-0 text-seafoam-500" />}
                <span className={`truncate text-sm ${m.direction === "inbound" && !m.read_at ? "font-semibold" : ""}`}>
                  {m.direction === "outbound" ? `To: ${m.to_email}` : (m.sender_name || m.sender_email)}
                </span>
              </div>
              <p className="truncate text-sm text-slate-600 dark:text-slate-300">{m.subject}</p>
              <p className="text-xs text-slate-600">{fmtDate(m.created_at)}</p>
            </button>
          ))}
        </Card>

        {/* Reading pane / composer */}
        <Card className="col-span-5 max-h-[70vh] overflow-y-auto p-4">
          {composeOpen ? (
            <div className="space-y-3">
              <h2 className="font-semibold">
                {replyTo ? "Reply" : "New message"} — from {activeBox}@getsweepr.com
              </h2>
              <Input label="To" placeholder="To" value={to} onChange={(e) => setTo(e.target.value)} />
              <Input label="Subject" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                placeholder="Write your message…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:border-slate-700 dark:bg-slate-900"
              />
              {replyTo && (
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800">
                  In reply to: <span className="font-medium">{replyTo.subject}</span>
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={() => void handleSend()} disabled={sending}>
                  <Send className="mr-1 h-4 w-4" /> {sending ? "Sending…" : "Send"}
                </Button>
                <Button variant="secondary" onClick={() => setComposeOpen(false)}>Cancel</Button>
              </div>
            </div>
          ) : selected ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{selected.subject}</h2>
                  <p className="text-sm text-slate-500">
                    {selected.direction === "outbound"
                      ? `Sent to ${selected.to_email}${selected.sent_by_email ? ` by ${selected.sent_by_email}` : ""}`
                      : `From ${selected.sender_name ? `${selected.sender_name} <${selected.sender_email}>` : selected.sender_email}`}
                  </p>
                  <p className="text-xs text-slate-600">{fmtDate(selected.created_at)}</p>
                </div>
                <Button variant="secondary" onClick={() => startReply(selected)}>
                  <Reply className="mr-1 h-4 w-4" /> Reply
                </Button>
              </div>
              <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-800">
                {selected.body_text || "(empty body)"}
              </div>
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-slate-600">Select a message to read it.</p>
          )}
        </Card>
      </div>

      {/* Mailbox permissions — super_admin only (hidden when the API says 403) */}
      {grants !== null && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-seafoam-500" />
            <h2 className="font-semibold">Mailbox access</h2>
            <span className="text-xs text-slate-600">Super admins always have every mailbox.</span>
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="grant-admin-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Admin</label>
              <select
                id="grant-admin-select"
                value={grantUser}
                onChange={(e) => setGrantUser(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Select admin…</option>
                {admins.filter((a) => a.role !== "super_admin" && a.admin_role !== "super_admin").map((a) => (
                  <option key={a.id} value={a.id}>{a.email}{a.admin_role ? ` (${a.admin_role})` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="grant-box-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Mailbox</label>
              <select
                id="grant-box-select"
                value={grantBox}
                onChange={(e) => setGrantBox(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Select mailbox…</option>
                {permBoxes.map((b) => <option key={b} value={b}>{b}@getsweepr.com</option>)}
              </select>
            </div>
            <Button onClick={() => void addGrant()}>Grant access</Button>
          </div>

          {grants.length === 0 ? (
            <p className="text-sm text-slate-600">No per-admin grants yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-600 dark:border-slate-700">
                  <th scope="col" className="py-2">Admin</th>
                  <th scope="col" className="py-2">Mailbox</th>
                  <th scope="col" className="py-2">Granted by</th>
                  <th scope="col" className="py-2" />
                </tr>
              </thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={g.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2">{g.email}</td>
                    <td className="py-2">{g.mailbox}@getsweepr.com</td>
                    <td className="py-2 text-slate-600">{g.granted_by_email ?? "—"}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => void removeGrant(g.id)} className="text-red-500 hover:text-red-700" title="Revoke">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
