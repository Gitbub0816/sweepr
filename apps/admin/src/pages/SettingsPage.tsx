import { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Input, Button, toast } from "@sweepr/ui";
import { SlackSettings } from "../components/SlackSettings";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface PlatformSettings {
  platformName: string;
  supportEmail: string;
  serviceFeePct: number;
  taxRatePct: number;
}

function AdminInvitePanel() {
  const { getToken } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setLink("");
    try {
      const bearer = await getToken();
      const resp = await fetch(`${API}/admin/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ email }),
      });
      const data = await resp.json() as { ok?: boolean; link?: string; error?: string };
      if (!resp.ok || !data.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Invite sent to ${email}`);
      setLink(data.link ?? "");
      setEmail("");
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Could not send invite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-lg space-y-4">
      <h2 className="text-sm font-semibold text-charcoal dark:text-white">Invite Admin</h2>
      <p className="text-sm text-gray-500">
        Send a one-time invite link. The recipient must use it within 7 days.
      </p>
      <form onSubmit={send} className="flex gap-2">
        <Input
          label=""
          type="email"
          placeholder="admin@example.com"
          value={email}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          required
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !email}>
          {loading ? "Sending…" : "Send invite"}
        </Button>
      </form>
      {link && (
        <div className="rounded-lg bg-teal-50 border border-teal-200 p-3">
          <p className="text-xs font-medium text-teal-700 mb-1">Invite link (copy as backup)</p>
          <p className="text-xs text-teal-600 break-all font-mono">{link}</p>
        </div>
      )}
    </Card>
  );
}

function GeneralSettingsPanel() {
  const { getToken } = useAuth();
  const [settings, setSettings] = useState<PlatformSettings>({
    platformName: "Sweepr",
    supportEmail: "support@getsweepr.com",
    serviceFeePct: 10,
    taxRatePct: 8.25,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/admin/settings`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error();
        const data = await res.json() as PlatformSettings;
        setSettings(data);
      } catch {
        // use defaults already in state
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  async function save() {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      toast.success("Settings saved");
    } catch {
      toast.error("Couldn't save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-lg space-y-4">
      <h2 className="text-sm font-semibold text-charcoal dark:text-white">General</h2>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : (
        <>
          <Input
            label="Platform name"
            value={settings.platformName}
            onChange={(e) => setSettings((s) => ({ ...s, platformName: e.target.value }))}
          />
          <Input
            label="Support email"
            type="email"
            value={settings.supportEmail}
            onChange={(e) => setSettings((s) => ({ ...s, supportEmail: e.target.value }))}
          />
          <Input
            label="Service fee (%)"
            type="number"
            value={settings.serviceFeePct}
            onChange={(e) => setSettings((s) => ({ ...s, serviceFeePct: parseFloat(e.target.value) || 0 }))}
          />
          <Input
            label="Tax rate (%)"
            type="number"
            value={settings.taxRatePct}
            onChange={(e) => setSettings((s) => ({ ...s, taxRatePct: parseFloat(e.target.value) || 0 }))}
          />
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </>
      )}
    </Card>
  );
}

export function SettingsPage() {
  return (
    <DashboardShell title="Settings" description="Platform-wide configuration.">
      <div className="space-y-6">
        <GeneralSettingsPanel />
        <AdminInvitePanel />
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Slack</h2>
          <SlackSettings />
        </div>
      </div>
    </DashboardShell>
  );
}
