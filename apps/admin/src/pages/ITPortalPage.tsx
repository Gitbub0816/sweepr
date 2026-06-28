import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { LifeBuoy, RefreshCw, X, Send, AlertTriangle, Ticket, UserCog, Activity, KeyRound, Link2, Search } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

type Section = "tickets" | "users" | "telemetry";
type View = "open" | "past_due" | "resolved" | "closed";

export function ITPortalPage() {
  const [section, setSection] = useState<Section>("tickets");
  const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
    { id: "tickets", label: "Tickets", icon: Ticket },
    { id: "users", label: "User Management", icon: UserCog },
    { id: "telemetry", label: "Telemetry", icon: Activity },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-charcoal">
          <LifeBuoy className="h-5 w-5" /> IT Portal
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">Help desk, account recovery, and system telemetry.</p>
      </div>
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                section === s.id ? "bg-white text-charcoal shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" /> {s.label}
            </button>
          );
        })}
      </div>
      {section === "tickets" && <TicketsSection />}
      {section === "users" && <UsersSection />}
      {section === "telemetry" && <TelemetrySection />}
    </div>
  );
}

interface Ticket {
  id: string;
  ticket_number: number;
  title: string;
  description: string | null;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved" | "closed";
  source: "user_report" | "error" | "admin";
  app: string | null;
  reporter_email: string | null;
  assigned_to: string | null;
  due_at: string | null;
  created_at: string;
}
interface Comment { id: string; author_email: string | null; is_admin: boolean; body: string; created_at: string; }
interface Counts { open: number; past_due: number; resolved: number; closed: number; }

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  normal: "bg-slate-100 text-slate-600",
  low: "bg-slate-100 text-slate-400",
};
const SOURCE_COLOR: Record<string, string> = {
  user_report: "bg-indigo-100 text-indigo-700",
  error: "bg-red-100 text-red-700",
  admin: "bg-amber-100 text-amber-700",
};
const TABS: { id: View; label: string; key: keyof Counts }[] = [
  { id: "open", label: "Open", key: "open" },
  { id: "past_due", label: "Past Due", key: "past_due" },
  { id: "resolved", label: "Resolved", key: "resolved" },
  { id: "closed", label: "Closed", key: "closed" },
];

function TicketsSection() {
  const { getToken } = useAuth();
  const [view, setView] = useState<View>("open");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Ticket | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/it-tickets/admin?view=${view}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = (await res.json()) as { tickets: Ticket[]; counts: Counts };
        setTickets(d.tickets ?? []);
        setCounts(d.counts ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken, view]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              view === t.id ? "border-seafoam-600 text-seafoam-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
            {counts && (
              <span className={`rounded-full px-1.5 text-xs ${t.id === "past_due" && counts.past_due > 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          No {view.replace("_", " ")} tickets.
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => {
            const overdue = t.due_at && new Date(t.due_at) < new Date() && (t.status === "open" || t.status === "in_progress");
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-300"
              >
                <span className="mt-0.5 font-mono text-xs text-slate-400">#{t.ticket_number}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLOR[t.source]}`}>{t.source.replace("_", " ")}</span>
                    {t.app && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t.app}</span>}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t.category.replace("_", " ")}</span>
                    {overdue && <span className="flex items-center gap-1 text-xs font-medium text-red-600"><AlertTriangle className="h-3 w-3" /> overdue</span>}
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-charcoal">{t.title}</p>
                  <p className="text-xs text-slate-400">
                    {t.reporter_email ?? "—"} · {new Date(t.created_at).toLocaleString()}
                    {t.status === "in_progress" && " · in progress"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <TicketDrawer
          ticketId={selected.id}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}

function TicketDrawer({ ticketId, onClose, onChanged }: { ticketId: string; onClose: () => void; onChanged: () => void }) {
  const { getToken } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = await getToken();
    const res = await fetch(`${API}/it-tickets/admin/${ticketId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const d = (await res.json()) as { ticket: Ticket; comments: Comment[] };
      setTicket(d.ticket);
      setComments(d.comments ?? []);
    }
  }, [getToken, ticketId]);
  useEffect(() => { load(); }, [load]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const token = await getToken();
      await fetch(`${API}/it-tickets/admin/${ticketId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onChanged();
    } finally { setBusy(false); }
  }

  async function addComment() {
    if (!comment.trim()) return;
    const token = await getToken();
    await fetch(`${API}/it-tickets/admin/${ticketId}/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: comment }),
    });
    setComment("");
    load();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold text-charcoal">
            {ticket ? `#${ticket.ticket_number} · ${ticket.title}` : "Loading…"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        {ticket && (
          <div className="mt-4 space-y-5">
            <p className="whitespace-pre-wrap text-sm text-slate-600">{ticket.description || "No description."}</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
              <div>Reporter: <span className="text-slate-700">{ticket.reporter_email ?? "—"}</span></div>
              <div>App: <span className="text-slate-700">{ticket.app ?? "—"}</span></div>
              <div>Category: <span className="text-slate-700">{ticket.category}</span></div>
              <div>Source: <span className="text-slate-700">{ticket.source}</span></div>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={ticket.status}
                onChange={(e) => patch({ status: e.target.value })}
                disabled={busy}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
              <select
                value={ticket.priority}
                onChange={(e) => patch({ priority: e.target.value })}
                disabled={busy}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <input
                type="date"
                defaultValue={ticket.due_at ? ticket.due_at.slice(0, 10) : ""}
                onChange={(e) => patch({ due_at: e.target.value || null })}
                disabled={busy}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                title="Due date"
              />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-charcoal">Activity</h3>
              <div className="space-y-2">
                {comments.map((cm) => (
                  <div key={cm.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                    <p className="text-xs text-slate-400">{cm.author_email ?? "admin"} · {new Date(cm.created_at).toLocaleString()}</p>
                    <p className="text-slate-700">{cm.body}</p>
                  </div>
                ))}
                {comments.length === 0 && <p className="text-xs text-slate-400">No activity yet.</p>}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment…"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && addComment()}
                />
                <button onClick={addComment} className="flex items-center gap-1 rounded-lg bg-seafoam-500 px-3 py-2 text-sm font-medium text-white hover:bg-seafoam-600">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── User Management (password reset via Clerk) ───────────────────────────────
interface ClerkUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  lastSignInAt: number | null;
  banned: boolean;
  twoFactorEnabled: boolean;
}

function UsersSection() {
  const { getToken } = useAuth();
  const [email, setEmail] = useState("");
  const [users, setUsers] = useState<ClerkUser[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!email.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/it/users?email=${encodeURIComponent(email.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(res.ok ? ((await res.json()) as { users: ClerkUser[] }).users ?? [] : []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
        Password resets are logged and require IT-admin access. Always verify the requester's identity before resetting.
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search by email…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <button onClick={search} disabled={loading} className="rounded-lg bg-seafoam-500 px-4 py-2 text-sm font-medium text-white hover:bg-seafoam-600 disabled:opacity-50">
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {searched && !loading && users.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-400">No users found.</div>
      )}

      <div className="space-y-2">
        {users.map((u) => <UserRow key={u.id} user={u} />)}
      </div>
    </div>
  );
}

function UserRow({ user }: { user: ClerkUser }) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function resetPassword() {
    if (pw.length < 8) { setMsg("Password must be at least 8 characters."); return; }
    setBusy(true); setMsg(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/it/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const d = await res.json() as { ok?: boolean; message?: string };
      setMsg(res.ok ? "✓ Temporary password set. Share it securely; ask the user to change it." : d.message || "Reset failed.");
      if (res.ok) setPw("");
    } finally { setBusy(false); }
  }

  async function signInLink() {
    setBusy(true); setMsg(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/it/users/${user.id}/sign-in-link`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json() as { ok?: boolean; url?: string | null; token?: string; message?: string };
      if (res.ok) {
        const link = d.url || d.token || "";
        await navigator.clipboard.writeText(link).catch(() => {});
        setMsg("✓ One-time sign-in link copied to clipboard (valid 30 min).");
      } else setMsg(d.message || "Could not create link.");
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-charcoal">
            {[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}
          </p>
          <p className="text-xs text-slate-500">{user.email ?? "—"}</p>
          <p className="mt-0.5 font-mono text-[10px] text-slate-300">{user.id}</p>
        </div>
        <div className="flex items-center gap-2">
          {user.banned && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">banned</span>}
          {user.twoFactorEnabled && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">2FA</span>}
          <button onClick={() => setOpen((o) => !o)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            Manage
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">Temporary password</label>
              <input
                type="text"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <button onClick={resetPassword} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-seafoam-500 px-3 py-2 text-sm font-medium text-white hover:bg-seafoam-600 disabled:opacity-50">
              <KeyRound className="h-4 w-4" /> Reset password
            </button>
            <button onClick={signInLink} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <Link2 className="h-4 w-4" /> Sign-in link
            </button>
          </div>
          {msg && <p className="text-xs text-slate-600">{msg}</p>}
        </div>
      )}
    </div>
  );
}

// ── Telemetry ────────────────────────────────────────────────────────────────
interface Telemetry {
  api: { total?: number; errors_5xx?: number; avg_ms?: number; p95_ms?: number };
  errors: { open?: number; last_24h?: number };
  tickets: { open?: number; past_due?: number };
  recentErrors: Array<{ id: string; source: string; app: string | null; level: string; message: string; path: string | null; status_code: number | null; occurred_at: string }>;
}

function Stat({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${alert ? "text-red-700" : "text-charcoal"}`}>{value}</p>
    </div>
  );
}

function TelemetrySection() {
  const { getToken } = useAuth();
  const [data, setData] = useState<Telemetry | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/it/telemetry`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setData((await res.json()) as Telemetry);
    } finally { setLoading(false); }
  }, [getToken]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="h-64 animate-pulse rounded-xl bg-slate-100" />;
  if (!data) return <p className="text-sm text-slate-500">Could not load telemetry.</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="API requests (24h)" value={data.api?.total ?? 0} />
        <Stat label="5xx errors (24h)" value={data.api?.errors_5xx ?? 0} alert={(data.api?.errors_5xx ?? 0) > 0} />
        <Stat label="Avg latency" value={`${data.api?.avg_ms ?? 0}ms`} />
        <Stat label="p95 latency" value={`${data.api?.p95_ms ?? 0}ms`} />
        <Stat label="Open errors" value={data.errors?.open ?? 0} alert={(data.errors?.open ?? 0) > 0} />
        <Stat label="Errors (24h)" value={data.errors?.last_24h ?? 0} />
        <Stat label="Open tickets" value={data.tickets?.open ?? 0} />
        <Stat label="Past due tickets" value={data.tickets?.past_due ?? 0} alert={(data.tickets?.past_due ?? 0) > 0} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-charcoal">Recent unresolved errors</div>
        <div className="divide-y divide-slate-50">
          {data.recentErrors.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-400">No unresolved errors. 🎉</p>
          ) : data.recentErrors.map((e) => (
            <div key={e.id} className="px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{e.level}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{e.source}{e.app ? `/${e.app}` : ""}</span>
                <span className="text-xs text-slate-400">{new Date(e.occurred_at).toLocaleString()}</span>
              </div>
              <p className="mt-1 font-mono text-sm text-charcoal">{e.message}</p>
              {e.path && <p className="font-mono text-xs text-slate-400">{e.path}{e.status_code ? ` → ${e.status_code}` : ""}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
