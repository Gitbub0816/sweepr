import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";
import { Slack, Plus, Trash2, Send } from "lucide-react";
import { Card, Button, Badge, Select, Input, toast } from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Workspace { id: string; team_id: string; team_name: string | null; status: string; last_error: string | null; created_at: string; }
interface MappedChannel { id: string; workspace_id: string; channel_id: string; channel_name: string | null; purpose: string; is_private: boolean; }
interface LiveChannel { id: string; name: string; is_private?: boolean; }

const PURPOSES = [
  { value: "approvals", label: "Approvals (Super Admin, private)" },
  { value: "admin", label: "Admin" },
  { value: "operations", label: "Operations" },
  { value: "finance", label: "Finance" },
  { value: "it", label: "IT" },
  { value: "training", label: "Training" },
  { value: "custom", label: "Custom" },
];

/** Slack connection + channel routing settings (lives under the Settings tab). */
export function SlackSettings() {
  const { getToken } = useAuth();
  const [params] = useSearchParams();
  const [connected, setConnected] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [channels, setChannels] = useState<MappedChannel[]>([]);
  const [live, setLive] = useState<LiveChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [purpose, setPurpose] = useState("approvals");
  const [mode, setMode] = useState<"map" | "create">("create");
  const [channelId, setChannelId] = useState("");
  const [createName, setCreateName] = useState("");

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authed("/slack/admin/status");
      if (res.ok) {
        const d = (await res.json()) as { connected: boolean; workspaces: Workspace[]; channels: MappedChannel[] };
        setConnected(d.connected);
        setWorkspaces(d.workspaces ?? []);
        setChannels(d.channels ?? []);
        const ws = d.workspaces?.[0];
        if (ws) {
          const lr = await authed(`/slack/admin/channels/${ws.id}`);
          if (lr.ok) setLive(((await lr.json()) as { channels: LiveChannel[] }).channels ?? []);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [authed]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (params.get("connected")) toast.success("Slack workspace connected.");
    if (params.get("connected_user")) toast.success("Your Slack account is connected.");
    if (params.get("error")) toast.error(`Slack: ${params.get("error")}`);
  }, [params]);

  async function connectWorkspace() {
    const res = await authed("/slack/install");
    if (!res.ok) return toast.error("Could not start Slack connection. Is SLACK_CLIENT_ID configured?");
    window.location.href = ((await res.json()) as { url: string }).url;
  }
  async function disconnect(id: string) {
    const res = await authed(`/slack/admin/disconnect/${id}`, { method: "POST" });
    if (res.ok) { toast.success("Workspace disconnected."); void load(); } else toast.error("Could not disconnect.");
  }
  async function addChannel() {
    const ws = workspaces[0];
    if (!ws) return;
    const body: Record<string, unknown> = { workspaceId: ws.id, purpose };
    if (mode === "map") { if (!channelId) return toast.error("Pick a channel."); body.channelId = channelId; }
    else { if (!createName) return toast.error("Enter a channel name."); body.createName = createName; }
    const res = await authed("/slack/admin/channels", { method: "POST", body: JSON.stringify(body) });
    if (res.ok) { toast.success("Channel mapped."); setChannelId(""); setCreateName(""); void load(); }
    else toast.error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not map channel.");
  }
  async function test(p: string) {
    const res = await authed("/slack/admin/test", { method: "POST", body: JSON.stringify({ purpose: p }) });
    if (res.ok) toast.success("Test message sent.");
    else toast.error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Test failed.");
  }
  async function provision() {
    toast("Provisioning channels…");
    const res = await authed("/slack/admin/provision-defaults", { method: "POST" });
    if (res.ok) {
      const d = (await res.json()) as { results: Array<{ name: string; invited: number }>; resolvedAdmins: number; totalAdmins: number };
      toast.success(`Channels ready. Invited members across ${d.results.length} channels (${d.resolvedAdmins}/${d.totalAdmins} admins matched in Slack).`);
      void load();
    } else toast.error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Provisioning failed.");
  }

  if (loading) return <Card className="max-w-2xl"><div className="h-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></Card>;

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Slack className="h-5 w-5 text-seafoam-600" />
          <h2 className="text-sm font-semibold text-charcoal dark:text-white">Slack connection</h2>
        </div>
        {!connected ? (
          <>
            <p className="text-sm text-slate-500">Connect a Slack workspace to post approval cards and notifications.</p>
            <Button onClick={connectWorkspace}>Connect Slack workspace</Button>
          </>
        ) : (
          <>
            {workspaces.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium text-charcoal dark:text-white">{w.team_name ?? w.team_id}</p>
                    <p className="text-xs text-slate-400">{w.last_error ? `Error: ${w.last_error}` : `Connected ${new Date(w.created_at).toLocaleDateString()}`}</p>
                  </div>
                  <Badge variant={w.status === "active" ? "success" : "error"}>{w.status}</Badge>
                </div>
                <Button size="sm" variant="ghost" onClick={() => disconnect(w.id)}><Trash2 className="h-4 w-4" /> Disconnect</Button>
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={connectWorkspace}><Plus className="h-4 w-4" /> Add another workspace</Button>
          </>
        )}
      </Card>

      {connected && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-charcoal dark:text-white">Channel routing</h2>
            <Button size="sm" variant="secondary" onClick={provision}>Provision default channels</Button>
          </div>
          <p className="text-xs text-slate-400">
            Creates Team-Wide (public) plus private Approvals, Operations, Finance, IT, and Training channels, and
            invites admins by role. Super Admins join every channel; IT and Training only their channel + Team-Wide.
          </p>
          {channels.length === 0 ? (
            <p className="text-sm text-slate-400">No channels mapped yet.</p>
          ) : channels.map((ch) => (
            <div key={ch.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div>
                <p className="font-medium text-charcoal dark:text-white">#{ch.channel_name ?? ch.channel_id}{ch.is_private && <span className="ml-2 text-xs text-slate-400">(private)</span>}</p>
                <Badge variant="info">{ch.purpose}</Badge>
              </div>
              <Button size="sm" variant="ghost" onClick={() => test(ch.purpose)}><Send className="h-4 w-4" /> Test</Button>
            </div>
          ))}
          <div className="space-y-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Purpose" options={PURPOSES} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              <Select label="Source" options={[{ value: "create", label: "Create a new channel" }, { value: "map", label: "Map an existing channel" }]} value={mode} onChange={(e) => setMode(e.target.value as "map" | "create")} />
            </div>
            {mode === "map" ? (
              <Select label="Channel" placeholder="Select a channel" options={live.map((c) => ({ value: c.id, label: `#${c.name}${c.is_private ? " (private)" : ""}` }))} value={channelId} onChange={(e) => setChannelId(e.target.value)} />
            ) : (
              <Input label="New channel name" placeholder="sweepr-approvals" value={createName} onChange={(e) => setCreateName(e.target.value)} hint="Lowercase letters, numbers, and dashes." />
            )}
            <Button size="sm" onClick={addChannel}><Plus className="h-4 w-4" /> Map channel</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
