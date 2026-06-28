import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";
import { Slack, RefreshCw, Plus, Trash2, Send } from "lucide-react";
import {
  DashboardShell,
  Card,
  Button,
  Badge,
  Select,
  Input,
  EmptyState,
  toast,
} from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Workspace {
  id: string;
  team_id: string;
  team_name: string | null;
  status: string;
  last_error: string | null;
  created_at: string;
}
interface MappedChannel {
  id: string;
  workspace_id: string;
  channel_id: string;
  channel_name: string | null;
  purpose: string;
  is_private: boolean;
}
interface LiveChannel {
  id: string;
  name: string;
  is_private?: boolean;
}

const PURPOSES = [
  { value: "approvals", label: "Approvals (Super Admin, private)" },
  { value: "admin", label: "Admin" },
  { value: "operations", label: "Operations" },
  { value: "finance", label: "Finance" },
  { value: "it", label: "IT" },
  { value: "training", label: "Training" },
  { value: "custom", label: "Custom" },
];

export function SlackPage() {
  const { getToken } = useAuth();
  const [params] = useSearchParams();
  const [connected, setConnected] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [channels, setChannels] = useState<MappedChannel[]>([]);
  const [live, setLive] = useState<LiveChannel[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-channel form state.
  const [purpose, setPurpose] = useState("approvals");
  const [mode, setMode] = useState<"map" | "create">("map");
  const [channelId, setChannelId] = useState("");
  const [createName, setCreateName] = useState("");

  const authed = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await getToken();
      return fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
      });
    },
    [getToken],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authed("/slack/admin/status");
      if (res.ok) {
        const d = (await res.json()) as {
          connected: boolean;
          workspaces: Workspace[];
          channels: MappedChannel[];
        };
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

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (params.get("connected")) toast.success("Slack workspace connected.");
    if (params.get("error")) toast.error(`Slack connection failed: ${params.get("error")}`);
  }, [params]);

  async function connect() {
    const res = await authed("/slack/install");
    if (!res.ok) {
      toast.error("Could not start Slack connection. Is SLACK_CLIENT_ID configured?");
      return;
    }
    const { url } = (await res.json()) as { url: string };
    window.location.href = url;
  }

  async function disconnect(id: string) {
    const res = await authed(`/slack/admin/disconnect/${id}`, { method: "POST" });
    if (res.ok) {
      toast.success("Workspace disconnected.");
      void load();
    } else toast.error("Could not disconnect.");
  }

  async function addChannel() {
    const ws = workspaces[0];
    if (!ws) return;
    const body: Record<string, unknown> = { workspaceId: ws.id, purpose };
    if (mode === "map") {
      if (!channelId) return toast.error("Pick a channel to map.");
      body.channelId = channelId;
    } else {
      if (!createName) return toast.error("Enter a channel name.");
      body.createName = createName;
    }
    const res = await authed("/slack/admin/channels", { method: "POST", body: JSON.stringify(body) });
    if (res.ok) {
      toast.success("Channel mapped.");
      setChannelId("");
      setCreateName("");
      void load();
    } else {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(e.error ?? "Could not map channel.");
    }
  }

  async function test(p: string) {
    const res = await authed("/slack/admin/test", { method: "POST", body: JSON.stringify({ purpose: p }) });
    if (res.ok) toast.success("Test message sent.");
    else {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(e.error ?? "Test failed.");
    }
  }

  return (
    <DashboardShell
      title="Slack"
      description="Connect a Slack workspace for approvals and notifications. Sweepr remains the source of truth."
      actions={
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
    >
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-seafoam-400 border-t-transparent" />
        </div>
      ) : !connected ? (
        <EmptyState
          icon={<Slack className="h-10 w-10 text-seafoam-500" />}
          title="No Slack workspace connected"
          description="Connect Slack to receive approval cards and notifications, and to act on them without leaving Slack."
          action={<Button onClick={connect}>Connect Slack</Button>}
        />
      ) : (
        <div className="space-y-6">
          {/* Workspaces */}
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">
              Connected workspaces
            </h2>
            <div className="space-y-2">
              {workspaces.map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <Slack className="h-5 w-5 text-seafoam-600" />
                    <div>
                      <p className="font-medium text-charcoal dark:text-white">
                        {w.team_name ?? w.team_id}
                      </p>
                      <p className="text-xs text-slate-400">
                        {w.last_error ? `Error: ${w.last_error}` : `Connected ${new Date(w.created_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Badge variant={w.status === "active" ? "success" : "error"}>{w.status}</Badge>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => disconnect(w.id)}>
                    <Trash2 className="h-4 w-4" /> Disconnect
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <Button size="sm" variant="secondary" onClick={connect}>
                <Plus className="h-4 w-4" /> Add another workspace
              </Button>
            </div>
          </Card>

          {/* Mapped channels */}
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">
              Channel routing
            </h2>
            {channels.length === 0 ? (
              <p className="text-sm text-slate-400">No channels mapped yet. Map one below.</p>
            ) : (
              <div className="space-y-2">
                {channels.map((ch) => (
                  <div key={ch.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div>
                      <p className="font-medium text-charcoal dark:text-white">
                        #{ch.channel_name ?? ch.channel_id}
                        {ch.is_private && <span className="ml-2 text-xs text-slate-400">(private)</span>}
                      </p>
                      <Badge variant="info">{ch.purpose}</Badge>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => test(ch.purpose)}>
                      <Send className="h-4 w-4" /> Test
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add channel form */}
            <div className="mt-4 space-y-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Purpose"
                  options={PURPOSES}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                />
                <Select
                  label="Source"
                  options={[
                    { value: "map", label: "Map an existing channel" },
                    { value: "create", label: "Create a new channel" },
                  ]}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as "map" | "create")}
                />
              </div>
              {mode === "map" ? (
                <Select
                  label="Channel"
                  placeholder="Select a channel"
                  options={live.map((c) => ({ value: c.id, label: `#${c.name}${c.is_private ? " (private)" : ""}` }))}
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                />
              ) : (
                <Input
                  label="New channel name"
                  placeholder="sweepr-approvals"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  hint="Lowercase letters, numbers, and dashes."
                />
              )}
              <Button size="sm" onClick={addChannel}>
                <Plus className="h-4 w-4" /> Map channel
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-charcoal dark:text-white">How it works</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-500">
              <li>Approval proposals post an interactive card to the <strong>approvals</strong> channel.</li>
              <li>Buttons (Approve / Decline / Request Changes / Join Collaboration) are verified against your Sweepr role before any action.</li>
              <li>Slack never changes Sweepr state directly — every action is executed and audited by Sweepr.</li>
            </ul>
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}
