import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { KeyRound, Search, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface PermDef { key: string; label: string; route?: string }
interface PermGroup { group: string; label: string; permissions: PermDef[] }
interface AdminUser { id: string; email: string; role: string | null; admin_role: string | null }
interface UserPerms {
  user: { id: string; email: string; adminRole: string | null; isSuper: boolean };
  roleDefaults: string[];
  effective: string[];
}

export function AccessControlPage() {
  const { getToken } = useAuth();
  const [catalog, setCatalog] = useState<PermGroup[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserPerms | null>(null);
  const [working, setWorking] = useState<Set<string>>(new Set());
  const [roleDefaults, setRoleDefaults] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const [cat, adm] = await Promise.all([
        fetch(`${API}/admin/permissions/catalog`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/admin/invites/admins`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (cat.ok) setCatalog(((await cat.json()) as { catalog: PermGroup[] }).catalog);
      if (adm.ok) setAdmins(((await adm.json()) as { admins: AdminUser[] }).admins);
    })();
  }, [getToken]);

  const openUser = useCallback(async (id: string) => {
    setSelected(id);
    setLoadingDetail(true);
    setDetail(null);
    const token = await getToken();
    const res = await fetch(`${API}/admin/permissions/user/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const d = (await res.json()) as UserPerms;
      setDetail(d);
      setWorking(new Set(d.effective));
      setRoleDefaults(new Set(d.roleDefaults));
    }
    setLoadingDetail(false);
  }, [getToken]);

  function toggle(key: string) {
    setWorking((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function resetToRole() {
    setWorking(new Set(roleDefaults));
  }

  async function save() {
    if (!detail) return;
    // Only send keys that DIFFER from the role default as overrides.
    const overrides: Array<{ permission_key: string; allow: boolean }> = [];
    for (const g of catalog) {
      for (const p of g.permissions) {
        const on = working.has(p.key);
        if (on !== roleDefaults.has(p.key)) overrides.push({ permission_key: p.key, allow: on });
      }
    }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/permissions/user/${detail.user.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Permissions saved (${overrides.length} override${overrides.length === 1 ? "" : "s"})`);
    } catch {
      toast.error("Couldn't save permissions. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const filtered = admins.filter((a) => a.email.toLowerCase().includes(query.toLowerCase()));
  const overrideCount = [...working].filter((k) => !roleDefaults.has(k)).length +
    [...roleDefaults].filter((k) => !working.has(k)).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-seafoam-600" />
        <h1 className="text-xl font-bold text-charcoal dark:text-white">Access Control</h1>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-slate-500">
        Roles set a starting point; here you can tune any single screen or action for any single
        admin. A green toggle differing from the role default is an explicit override.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* User list */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search admins…"
              className="w-full rounded-lg border border-slate-200 bg-transparent py-1.5 pl-8 pr-2 text-sm dark:border-slate-700"
              aria-label="Search admins"
            />
          </div>
          <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
            {filtered.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => void openUser(a.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selected === a.id
                      ? "bg-seafoam-50 text-seafoam-800 dark:bg-seafoam-900/30 dark:text-seafoam-200"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="block truncate font-medium">{a.email}</span>
                  <span className="text-xs text-slate-400">{a.admin_role ?? a.role ?? "admin"}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-400">No admins</li>}
          </ul>
        </div>

        {/* Permission editor */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          {!detail && (
            <div className="py-24 text-center text-sm text-slate-400">
              {loadingDetail ? "Loading…" : "Select an admin to edit their permissions."}
            </div>
          )}
          {detail && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-charcoal dark:text-white">{detail.user.email}</p>
                  <p className="text-xs text-slate-500">
                    Role: <span className="font-medium">{detail.user.adminRole ?? "admin"}</span>
                    {overrideCount > 0 && <span className="ml-2 text-amber-600">· {overrideCount} override{overrideCount === 1 ? "" : "s"}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={resetToRole} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                    <RotateCcw className="h-3.5 w-3.5" /> Reset to role
                  </button>
                  <button type="button" onClick={() => void save()} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-seafoam-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-seafoam-700 disabled:opacity-50">
                    <ShieldCheck className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>

              {detail.user.isSuper && (
                <div className="mb-4 rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">
                  This user is a super admin and always has every permission — overrides don't apply.
                </div>
              )}

              <div className={`space-y-6 ${detail.user.isSuper ? "pointer-events-none opacity-50" : ""}`}>
                {catalog.map((g) => (
                  <section key={g.group}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</h3>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {g.permissions.map((p) => {
                        const on = working.has(p.key);
                        const overridden = on !== roleDefaults.has(p.key);
                        return (
                          <label
                            key={p.key}
                            className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                              overridden ? "border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-900/10" : "border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            <span className="text-charcoal dark:text-slate-200">{p.label}</span>
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggle(p.key)}
                              className="h-4 w-4 shrink-0 accent-seafoam-600"
                              aria-label={p.label}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
