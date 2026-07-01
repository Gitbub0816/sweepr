import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Bell, RefreshCw } from "lucide-react";
import { toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Item {
  key: string;
  label: string;
  description: string;
  audience: "customer" | "cleaner" | "admin";
  enabled: boolean;
}
interface Group {
  category: string;
  items: Item[];
}

const AUDIENCE_COLOR: Record<string, string> = {
  customer: "bg-indigo-100 text-indigo-700",
  cleaner: "bg-seafoam-100 text-seafoam-700",
  admin: "bg-amber-100 text-amber-700",
};

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${on ? "bg-seafoam-500" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function NotificationsPage() {
  const { getToken } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/notification-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setGroups(((await res.json()) as { groups: Group[] }).groups ?? []);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  async function toggle(item: Item) {
    const next = !item.enabled;
    setSaving(item.key);
    setGroups((gs) =>
      gs.map((g) => ({ ...g, items: g.items.map((i) => (i.key === item.key ? { ...i, enabled: next } : i)) })),
    );
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/notification-settings`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ event_key: item.key, enabled: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // revert on failure
      setGroups((gs) =>
        gs.map((g) => ({ ...g, items: g.items.map((i) => (i.key === item.key ? { ...i, enabled: item.enabled } : i)) })),
      );
      toast.error("Failed to update notification setting");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-charcoal">
            <Bell className="h-5 w-5" /> Notifications
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Turn notification events on or off across customer, cleaner, and admin channels.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.category} className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-5 py-3">
                <h2 className="text-sm font-semibold text-charcoal">{g.category}</h2>
              </div>
              <div className="divide-y divide-slate-50">
                {g.items.map((item) => (
                  <div key={item.key} className="flex items-center gap-4 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-charcoal">{item.label}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${AUDIENCE_COLOR[item.audience]}`}>
                          {item.audience}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{item.description}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-300">{item.key}</p>
                    </div>
                    <span className={`text-xs ${item.enabled ? "text-seafoam-600" : "text-slate-400"}`}>
                      {item.enabled ? "On" : "Off"}
                    </span>
                    <Toggle on={item.enabled} onClick={() => toggle(item)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {saving && <p className="text-xs text-slate-400">Saving…</p>}
        </div>
      )}
    </div>
  );
}
