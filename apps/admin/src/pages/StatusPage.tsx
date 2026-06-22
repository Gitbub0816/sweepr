import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Button, Input } from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
type IncidentSeverity = "minor" | "major" | "critical";

interface StatusUpdate {
  id: string;
  incident_id: string;
  message: string;
  status: string;
  created_at: string;
}

interface Incident {
  id: string;
  title: string;
  summary: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  affected_features: string[];
  is_prelaunch_update: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  updates: StatusUpdate[];
}

type SiteSettings = Record<string, string | undefined>;

const STATUS_COLORS: Record<IncidentStatus, string> = {
  investigating: "bg-yellow-100 text-yellow-800",
  identified: "bg-orange-100 text-orange-800",
  monitoring: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
};

const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  minor: "bg-slate-100 text-slate-700",
  major: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

function Badge({ text, className }: { text: string; className: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {text}
    </span>
  );
}

export function StatusPage() {
  const { getToken } = useAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [settings, setSettings] = useState<SiteSettings>({});
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [addUpdateFor, setAddUpdateFor] = useState<string | null>(null);

  // New incident form state
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newStatus, setNewStatus] = useState<IncidentStatus>("investigating");
  const [newSeverity, setNewSeverity] = useState<IncidentSeverity>("minor");
  const [newFeatures, setNewFeatures] = useState("");
  const [newIsPrelaunch, setNewIsPrelaunch] = useState(false);

  // Add update form state
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateStatus, setUpdateStatus] = useState<IncidentStatus>("investigating");

  async function fetchData() {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };
    const [incRes, settingsRes] = await Promise.all([
      fetch(`${API_URL}/admin/status/incidents`, { headers }),
      fetch(`${API_URL}/admin/status/settings`, { headers }),
    ]);
    if (incRes.ok) setIncidents(await incRes.json() as Incident[]);
    if (settingsRes.ok) setSettings(await settingsRes.json() as SiteSettings);
    setLoading(false);
  }

  useEffect(() => {
    void fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patchSetting(key: string, value: string) {
    const token = await getToken();
    await fetch(`${API_URL}/admin/status/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ key, value }),
    });
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function createIncident(e: React.FormEvent) {
    e.preventDefault();
    const token = await getToken();
    const res = await fetch(`${API_URL}/admin/status/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: newTitle,
        summary: newSummary,
        status: newStatus,
        severity: newSeverity,
        affected_features: newFeatures.split(",").map((s) => s.trim()).filter(Boolean),
        is_prelaunch_update: newIsPrelaunch,
      }),
    });
    if (res.ok) {
      setShowNewForm(false);
      setNewTitle("");
      setNewSummary("");
      setNewStatus("investigating");
      setNewSeverity("minor");
      setNewFeatures("");
      setNewIsPrelaunch(false);
      await fetchData();
    }
  }

  async function addUpdate(e: React.FormEvent, incidentId: string) {
    e.preventDefault();
    const token = await getToken();
    const res = await fetch(`${API_URL}/admin/status/incidents/${incidentId}/updates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message: updateMessage, status: updateStatus }),
    });
    if (res.ok) {
      setAddUpdateFor(null);
      setUpdateMessage("");
      setUpdateStatus("investigating");
      await fetchData();
    }
  }

  async function patchIncidentStatus(id: string, status: IncidentStatus) {
    const token = await getToken();
    await fetch(`${API_URL}/admin/status/incidents/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    await fetchData();
  }

  if (loading) {
    return (
      <DashboardShell title="Status Management" description="Manage prelaunch settings and incidents">
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-seafoam-400 border-t-transparent" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Status Management" description="Manage prelaunch settings and incidents">
      <div className="space-y-8">
        {/* Prelaunch Settings */}
        <Card>
          <div className="p-6">
            <h2 className="mb-4 text-base font-semibold text-charcoal dark:text-white">
              Prelaunch Settings
            </h2>
            <div className="space-y-4">
              {(
                [
                  { key: "prelaunch_cleaner", label: "Cleaner app in prelaunch" },
                  { key: "prelaunch_customer", label: "Customer app in prelaunch" },
                ] as { key: keyof SiteSettings; label: string }[]
              ).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings[key] === "true"}
                    onChange={(e) => void patchSetting(key, e.target.checked ? "true" : "false")}
                    className="h-4 w-4 rounded border-slate-300 text-seafoam-500 focus:ring-seafoam-400"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </Card>

        {/* Incidents */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-charcoal dark:text-white">
              Incidents
            </h2>
            <Button size="sm" onClick={() => setShowNewForm(!showNewForm)}>
              {showNewForm ? "Cancel" : "New Incident"}
            </Button>
          </div>

          {showNewForm && (
            <Card className="mb-4">
              <form onSubmit={(e) => void createIncident(e)} className="p-6 space-y-4">
                <h3 className="text-sm font-semibold text-charcoal dark:text-white">
                  Create Incident
                </h3>
                <Input
                  label="Title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Summary
                  </label>
                  <textarea
                    value={newSummary}
                    onChange={(e) => setNewSummary(e.target.value)}
                    required
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Status
                    </label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value as IncidentStatus)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    >
                      <option value="investigating">Investigating</option>
                      <option value="identified">Identified</option>
                      <option value="monitoring">Monitoring</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Severity
                    </label>
                    <select
                      value={newSeverity}
                      onChange={(e) => setNewSeverity(e.target.value as IncidentSeverity)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    >
                      <option value="minor">Minor</option>
                      <option value="major">Major</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>
                <Input
                  label="Affected features (comma-separated)"
                  value={newFeatures}
                  onChange={(e) => setNewFeatures(e.target.value)}
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsPrelaunch}
                    onChange={(e) => setNewIsPrelaunch(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-seafoam-500 focus:ring-seafoam-400"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Prelaunch update
                  </span>
                </label>
                <Button type="submit">Create Incident</Button>
              </form>
            </Card>
          )}

          <div className="space-y-4">
            {incidents.length === 0 && (
              <p className="text-sm text-slate-500">No incidents yet.</p>
            )}
            {incidents.map((incident) => (
              <Card key={incident.id}>
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-charcoal dark:text-white">
                          {incident.title}
                        </span>
                        <Badge
                          text={incident.status}
                          className={STATUS_COLORS[incident.status]}
                        />
                        <Badge
                          text={incident.severity}
                          className={SEVERITY_COLORS[incident.severity]}
                        />
                        {incident.is_prelaunch_update && (
                          <Badge text="prelaunch" className="bg-purple-100 text-purple-700" />
                        )}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                        {incident.summary}
                      </p>
                      {incident.affected_features.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {incident.affected_features.map((f) => (
                            <span
                              key={f}
                              className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-slate-400">
                        Created {new Date(incident.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {incident.status !== "resolved" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void patchIncidentStatus(incident.id, "resolved")}
                        >
                          Resolve
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setAddUpdateFor(
                            addUpdateFor === incident.id ? null : incident.id
                          )
                        }
                      >
                        Add Update
                      </Button>
                    </div>
                  </div>

                  {addUpdateFor === incident.id && (
                    <form
                      onSubmit={(e) => void addUpdate(e, incident.id)}
                      className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-4 space-y-3"
                    >
                      <h4 className="text-sm font-medium text-charcoal dark:text-white">
                        Add Timeline Update
                      </h4>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Status
                        </label>
                        <select
                          value={updateStatus}
                          onChange={(e) => setUpdateStatus(e.target.value as IncidentStatus)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                        >
                          <option value="investigating">Investigating</option>
                          <option value="identified">Identified</option>
                          <option value="monitoring">Monitoring</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Message
                        </label>
                        <textarea
                          value={updateMessage}
                          onChange={(e) => setUpdateMessage(e.target.value)}
                          required
                          rows={2}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm">
                          Post Update
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setAddUpdateFor(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}

                  {incident.updates.length > 0 && (
                    <div className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-4">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        Timeline
                      </h4>
                      <div className="space-y-2">
                        {incident.updates.map((u) => (
                          <div key={u.id} className="flex gap-3 text-sm">
                            <span className="text-slate-400 whitespace-nowrap">
                              {new Date(u.created_at).toLocaleString()}
                            </span>
                            <Badge
                              text={u.status}
                              className={STATUS_COLORS[u.status as IncidentStatus] ?? "bg-slate-100 text-slate-700"}
                            />
                            <span className="text-slate-700 dark:text-slate-300">{u.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
