import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { Card, Button, toast, CardListSkeleton } from "@sweepr/ui";
import { Inbox, RotateCw, ShieldCheck, Trash2 } from "lucide-react";
import { MailboxList } from "../components/mail/MailboxList";
import { MessageList } from "../components/mail/MessageList";
import { ReadingPane } from "../components/mail/ReadingPane";
import { ComposeModal } from "../components/mail/ComposeModal";
import { EMPTY_COMPOSE, type Box, type ComposeState, type Folder, type Grant, type AdminUser, type Message } from "../components/mail/types";
import { quoteBody } from "../components/mail/utils";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";
const PAGE_SIZE = 50;

export function MailPage() {
  const { getToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [boxes, setBoxes] = useState<Box[]>([]);
  const [activeBox, setActiveBox] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<Folder>("inbox");
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");

  // Best-effort cache of every message we've ever fetched, across boxes/folders,
  // used to resolve thread parents (no dedicated "get message by id" endpoint exists).
  const messageCacheRef = useRef<Map<string, Message>>(new Map());
  const [parent, setParent] = useState<Message | null>(null);

  const [compose, setCompose] = useState<ComposeState>(EMPTY_COMPOSE);
  const [sending, setSending] = useState(false);

  // Permissions (super_admin only — section hides itself on 403)
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [permBoxes, setPermBoxes] = useState<string[]>([]);
  const [grantUser, setGrantUser] = useState("");
  const [grantBox, setGrantBox] = useState("");

  const deepLinkHandled = useRef(false);

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  }, [getToken]);

  const loadBoxes = useCallback(async () => {
    const res = await authed("/admin-mail/boxes");
    if (!res.ok) { setLoading(false); return; }
    const data = (await res.json()) as { boxes: Box[] };
    setBoxes(data.boxes);
    setActiveBox((prev) => prev ?? data.boxes[0]?.id ?? null);
    setLoading(false);
  }, [authed]);

  const loadMessages = useCallback(async (box: string, folder: Folder, q: string, offset: number, append: boolean) => {
    if (append) setLoadingMore(true); else setListLoading(true);
    try {
      const params = new URLSearchParams({ folder, limit: String(PAGE_SIZE), offset: String(offset) });
      if (q) params.set("q", q);
      const res = await authed(`/admin-mail/${box}/messages?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { messages: Message[] };
      for (const m of data.messages) messageCacheRef.current.set(m.id, m);
      setMessages((prev) => (append ? [...prev, ...data.messages] : data.messages));
      setHasMore(data.messages.length === PAGE_SIZE);
    } finally {
      setListLoading(false);
      setLoadingMore(false);
    }
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
  useEffect(() => {
    if (activeBox) void loadMessages(activeBox, activeFolder, query, 0, false);
  }, [activeBox, activeFolder, query, loadMessages]);

  // Resolve thread parent for the selected message, from cache only (best effort).
  useEffect(() => {
    if (selected?.in_reply_to) {
      setParent(messageCacheRef.current.get(selected.in_reply_to) ?? null);
    } else {
      setParent(null);
    }
  }, [selected]);

  // Deep link: ?box=&compose=1&to=&subject=&body=
  useEffect(() => {
    if (deepLinkHandled.current) return;
    if (boxes.length === 0) return;
    deepLinkHandled.current = true;

    const boxParam = searchParams.get("box");
    const composeParam = searchParams.get("compose");
    const to = searchParams.get("to") ?? "";
    const subject = searchParams.get("subject") ?? "";
    const body = searchParams.get("body") ?? "";

    let usedBox: string | null = null;
    if (boxParam && boxes.some((b) => b.id === boxParam)) {
      setActiveBox(boxParam);
      usedBox = boxParam;
    }

    if (composeParam === "1") {
      setCompose({ ...EMPTY_COMPOSE, open: true, to, subject, body });
    }

    if (boxParam || composeParam || to || subject || body) {
      const next = new URLSearchParams(searchParams);
      for (const key of ["box", "compose", "to", "subject", "body"]) next.delete(key);
      setSearchParams(next, { replace: true });
    }
    void usedBox;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxes]);

  const activeBoxAddress = useMemo(() => boxes.find((b) => b.id === activeBox)?.address ?? null, [boxes, activeBox]);

  async function openMessage(m: Message) {
    setSelected(m);
    if (m.direction === "inbound" && !m.read_at && activeBox) {
      await authed(`/admin-mail/${activeBox}/messages/${m.id}/read`, { method: "POST" });
      const updated = { ...m, read_at: new Date().toISOString() };
      messageCacheRef.current.set(m.id, updated);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
      setSelected(updated);
      setBoxes((prev) => prev.map((b) => (b.id === activeBox ? { ...b, unread: Math.max(0, (b.unread ?? 0) - 1) } : b)));
    }
  }

  async function toggleRead(m: Message) {
    if (!activeBox) return;
    const nextRead = !m.read_at;
    const endpoint = nextRead ? "read" : "unread";
    const res = await authed(`/admin-mail/${activeBox}/messages/${m.id}/${endpoint}`, { method: "POST" });
    if (!res.ok) { toast.error("Update failed"); return; }
    const updated = { ...m, read_at: nextRead ? new Date().toISOString() : null };
    messageCacheRef.current.set(m.id, updated);
    setMessages((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
    if (selected?.id === m.id) setSelected(updated);
    setBoxes((prev) => prev.map((b) => (b.id === activeBox ? { ...b, unread: Math.max(0, (b.unread ?? 0) + (nextRead ? -1 : 1)) } : b)));
  }

  async function toggleArchive(m: Message) {
    if (!activeBox) return;
    const nextArchived = !m.archived_at;
    const endpoint = nextArchived ? "archive" : "unarchive";
    const res = await authed(`/admin-mail/${activeBox}/messages/${m.id}/${endpoint}`, { method: "POST" });
    if (!res.ok) { toast.error("Update failed"); return; }
    toast.success(nextArchived ? "Message archived" : "Message restored");
    const updated = { ...m, archived_at: nextArchived ? new Date().toISOString() : null };
    messageCacheRef.current.set(m.id, updated);
    // The item may no longer belong in the current folder view — refresh from server.
    void loadMessages(activeBox, activeFolder, query, 0, false);
    if (selected?.id === m.id) setSelected(updated);
  }

  function startCompose() {
    setCompose({ ...EMPTY_COMPOSE, open: true });
  }

  function startReply(m: Message) {
    setCompose({
      open: true,
      mode: "reply",
      to: m.direction === "inbound" ? m.sender_email : (m.to_email ?? ""),
      cc: "",
      subject: m.subject.toLowerCase().startsWith("re:") ? m.subject : `Re: ${m.subject}`,
      body: quoteBody(m),
      inReplyTo: m.id,
    });
  }

  function startReplyAll(m: Message) {
    const to = m.direction === "inbound" ? m.sender_email : (m.to_email ?? "");
    const ccParts = [m.cc_email, m.direction === "inbound" ? m.to_email : m.sender_email].filter(Boolean) as string[];
    setCompose({
      open: true,
      mode: "reply-all",
      to,
      cc: ccParts.join(", "),
      subject: m.subject.toLowerCase().startsWith("re:") ? m.subject : `Re: ${m.subject}`,
      body: quoteBody(m),
      inReplyTo: m.id,
    });
  }

  function startForward(m: Message) {
    setCompose({
      open: true,
      mode: "forward",
      to: "",
      cc: "",
      subject: m.subject.toLowerCase().startsWith("fwd:") ? m.subject : `Fwd: ${m.subject}`,
      body: quoteBody(m),
    });
  }

  function closeCompose() {
    setCompose(EMPTY_COMPOSE);
  }

  function patchCompose(patch: Partial<ComposeState>) {
    setCompose((prev) => ({ ...prev, ...patch }));
  }

  async function handleSend() {
    if (!activeBox) return;
    setSending(true);
    try {
      const res = await authed(`/admin-mail/${activeBox}/send`, {
        method: "POST",
        body: JSON.stringify({
          to: compose.to,
          ...(compose.cc.trim() ? { cc: compose.cc } : {}),
          subject: compose.subject,
          body: compose.body,
          ...(compose.inReplyTo ? { inReplyTo: compose.inReplyTo } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "Send failed");
      toast.success(`Sent from ${activeBoxAddress ?? activeBox}`);
      closeCompose();
      setActiveFolder("sent");
      setQuery("");
      void loadMessages(activeBox, "sent", "", 0, false);
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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (compose.open) closeCompose();
        else if (selected) setSelected(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [compose.open, selected]);

  if (loading) return <div className="p-6"><CardListSkeleton rows={4} /></div>;

  if (boxes.length === 0) {
    return (
      <Card className="m-6 p-8 text-center text-slate-500">
        <Inbox className="mx-auto mb-3 h-8 w-8" />
        You don't have access to any mailboxes. Ask a super admin to grant you one.
      </Card>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-charcoal dark:text-white">Mail</h1>
        <Button
          variant="secondary"
          onClick={() => { void loadBoxes(); if (activeBox) void loadMessages(activeBox, activeFolder, query, 0, false); }}
        >
          <RotateCw className="mr-1 h-4 w-4" aria-hidden="true" /> Refresh
        </Button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-12 lg:overflow-hidden">
        <div className="lg:col-span-3 lg:h-full lg:overflow-hidden">
          <MailboxList
            boxes={boxes}
            activeBox={activeBox}
            activeFolder={activeFolder}
            onSelectBox={(id) => { setActiveBox(id); setActiveFolder("inbox"); setSelected(null); setQuery(""); }}
            onSelectFolder={(f) => { setActiveFolder(f); setSelected(null); }}
            onCompose={startCompose}
          />
        </div>

        <Card className="min-h-[24rem] overflow-hidden p-0 lg:col-span-4 lg:h-full">
          <MessageList
            messages={messages}
            folder={activeFolder}
            selectedId={selected?.id ?? null}
            loading={listLoading}
            hasMore={hasMore}
            loadingMore={loadingMore}
            query={query}
            onQueryChange={setQuery}
            onSelect={(m) => void openMessage(m)}
            onLoadMore={() => activeBox && void loadMessages(activeBox, activeFolder, query, messages.length, true)}
            onArchiveToggle={(m) => void toggleArchive(m)}
            onReadToggle={(m) => void toggleRead(m)}
          />
        </Card>

        <Card className="min-h-[24rem] overflow-hidden p-0 lg:col-span-5 lg:h-full">
          <ReadingPane
            message={selected}
            parent={parent}
            onReply={startReply}
            onReplyAll={startReplyAll}
            onForward={startForward}
            onArchiveToggle={(m) => void toggleArchive(m)}
            onMarkUnread={(m) => void toggleRead(m)}
          />
        </Card>
      </div>

      <ComposeModal
        boxAddress={activeBoxAddress}
        compose={compose}
        sending={sending}
        onChange={patchCompose}
        onSend={() => void handleSend()}
        onClose={closeCompose}
      />

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
              <label htmlFor="grant-admin-select" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Admin</label>
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
              <label htmlFor="grant-box-select" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Mailbox</label>
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
