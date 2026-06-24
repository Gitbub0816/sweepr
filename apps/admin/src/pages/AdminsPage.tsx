import { useState, useEffect } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { Shield, UserPlus, ChevronDown, Check, Clock, Mail, RefreshCw } from "lucide-react";
import { useAdminRole, type AdminRole } from "../hooks/useAdminRole";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

const ROLES: { value: AdminRole; label: string; color: string; description: string }[] = [
  { value: "super_admin", label: "Super Admin", color: "bg-purple-100 text-purple-700", description: "Full unrestricted access including system settings" },
  { value: "admin", label: "Admin", color: "bg-seafoam-100 text-seafoam-700", description: "Full access except system settings" },
  { value: "ops", label: "Operations", color: "bg-blue-100 text-blue-700", description: "Jobs, cleaners, customers, disputes, service areas" },
  { value: "finance", label: "Finance", color: "bg-emerald-100 text-emerald-700", description: "Pricing, insurance, payouts, payment observability" },
  { value: "trainer", label: "Trainer", color: "bg-amber-100 text-amber-700", description: "Training content and courses only" },
  { value: "support", label: "Support", color: "bg-slate-100 text-slate-600", description: "Read-only access to jobs, customers, disputes" },
];

interface AdminUser {
  id: string;
  email: string;
  role: string;
  admin_role: string | null;
  created_at: string;
}

interface Invite {
  id: string;
  email: string;
  admin_role: string;
  expires_at: string;
  created_at: string;
}

function RoleBadge({ role }: { role: string | null }) {
  const r = ROLES.find(x => x.value === role) ?? { label: role ?? "admin", color: "bg-slate-100 text-slate-500" };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${r.color}`}>{r.label}</span>;
}

function RoleSelect({ value, onChange, disabled }: { value: string; onChange: (r: AdminRole) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const current = ROLES.find(r => r.value === value);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
      >
        <RoleBadge role={value} />
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl shadow-lg border border-slate-200 w-64 py-1">
          {ROLES.map(r => (
            <button
              key={r.value}
              onClick={() => { onChange(r.value); setOpen(false); }}
              className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 text-left"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.color}`}>{r.label}</span>
                  {r.value === value && <Check className="h-3 w-3 text-seafoam-500" />}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{r.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminsPage() {
  const { getToken } = useAuth();
  const { user: currentUser } = useUser();
  const { role: myRole } = useAdminRole();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AdminRole>("admin");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const [aRes, iRes] = await Promise.all([
        fetch(`${API}/admin/invites/admins`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/admin/invites`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (aRes.ok) setAdmins(((await aRes.json()) as { admins: AdminUser[] }).admins);
      if (iRes.ok) setInvites(((await iRes.json()) as { invites: Invite[] }).invites);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function sendInvite() {
    if (!inviteEmail) return;
    setInviting(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/invites`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, adminRole: inviteRole }),
      });
      const data = await res.json() as { ok?: boolean; link?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to send invite");
      setInviteLink(data.link ?? "");
      setInviteEmail("");
      void load();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(userId: string, newRole: AdminRole) {
    const token = await getToken();
    const res = await fetch(`${API}/admin/invites/admins/${userId}/role`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ adminRole: newRole }),
    });
    if (res.ok) void load();
  }

  const canChangeRoles = myRole === "super_admin" || myRole === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-charcoal">Admin Team</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage admin users and their permission levels.</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Role matrix */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Permission Levels</p>
        </div>
        <div className="divide-y divide-slate-100">
          {ROLES.map(r => (
            <div key={r.value} className="flex items-center gap-4 px-4 py-3">
              <span className="w-36 shrink-0"><RoleBadge role={r.value} /></span>
              <p className="text-sm text-slate-500 flex-1">{r.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Invite form */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="h-4 w-4 text-seafoam-600" />
          <h2 className="text-sm font-semibold text-charcoal">Invite admin</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="Email address"
            type="email"
            className="flex-1 min-w-48 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
          />
          <RoleSelect value={inviteRole} onChange={setInviteRole} />
          <button
            onClick={sendInvite}
            disabled={inviting || !inviteEmail}
            className="rounded-lg bg-seafoam-500 px-4 py-2 text-sm font-semibold text-white hover:bg-seafoam-600 disabled:opacity-50"
          >
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        {inviteLink && (
          <div className="mt-3 rounded-lg bg-seafoam-50 border border-seafoam-200 px-3 py-2">
            <p className="text-xs text-seafoam-700 font-medium mb-1">Invite link (share if email fails):</p>
            <p className="text-xs font-mono text-seafoam-600 break-all">{inviteLink}</p>
          </div>
        )}
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Pending Invites ({invites.length})
          </h2>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-left">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invites.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-slate-400" />{inv.email}</td>
                    <td className="px-4 py-2.5"><RoleBadge role={inv.admin_role} /></td>
                    <td className="px-4 py-2.5 text-slate-400">{new Date(inv.expires_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Admin users */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" /> Active Admins ({admins.length})
        </h2>
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Role</th>
                <th className="px-4 py-2 text-left">Since</th>
                {canChangeRoles && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {admins.map(a => {
                const isSelf = a.email === currentUser?.primaryEmailAddress?.emailAddress;
                return (
                  <tr key={a.id} className={`hover:bg-slate-50 ${isSelf ? "bg-seafoam-50/50" : ""}`}>
                    <td className="px-4 py-3 text-charcoal">
                      {a.email} {isSelf && <span className="ml-1 text-xs text-seafoam-600">(you)</span>}
                    </td>
                    <td className="px-4 py-3"><RoleBadge role={a.admin_role ?? a.role} /></td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(a.created_at).toLocaleDateString()}</td>
                    {canChangeRoles && (
                      <td className="px-4 py-3 text-right">
                        {!isSelf && (
                          <RoleSelect
                            value={a.admin_role ?? "admin"}
                            onChange={r => changeRole(a.id, r)}
                            disabled={!canChangeRoles}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
