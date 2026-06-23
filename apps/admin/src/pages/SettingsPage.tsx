import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Input, Button, toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

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

export function SettingsPage() {
  return (
    <DashboardShell title="Settings" description="Platform-wide configuration.">
      <div className="space-y-6">
        <Card className="max-w-lg space-y-4">
          <h2 className="text-sm font-semibold text-charcoal dark:text-white">General</h2>
          <Input label="Platform name" defaultValue="Sweepr" />
          <Input label="Support email" defaultValue="support@getsweepr.com" />
          <Input label="Service fee (%)" type="number" defaultValue={10} />
          <Input label="Tax rate (%)" type="number" defaultValue={8.25} />
          <Button onClick={() => toast.success("Settings saved")}>Save settings</Button>
        </Card>

        <AdminInvitePanel />
      </div>
    </DashboardShell>
  );
}
