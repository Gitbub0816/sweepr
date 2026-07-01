import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Button, Input, toast } from "@sweepr/ui";
import { Bot, Wrench } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
type IncidentSeverity = "minor" | "moderate" | "major" | "critical";
type MaintenanceStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
type Tab = "incidents" | "maintenance" | "settings";

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
  auto_detected: boolean;
  error_fingerprint: string | null;
  affected_user_count: number | null;
  total_occurrences: number | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  updates: StatusUpdate[];
}

interface MaintenanceWindow {
  id: string;
  title: string;
  description: string | null;
  scheduled_start: string;
  scheduled_end: string;
  affected_services: string[];
  status: MaintenanceStatus;
  created_by: string;
  created_at: string;
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
  moderate: "bg-yellow-100 text-yellow-800",
  major: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const MAINTENANCE_STATUS_COLORS: Record<MaintenanceStatus, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-slate-100 text-slate-500",
};

function Badge({ text, className }: { text: string; className: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{text}</span>
  );
}

const selectCls = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white";
const textareaCls = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white";

export function StatusPage() {
  const { getToken } = useAuth();
  const [tab, setTab] = useState<Tab>("incidents");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceWindow[]>([]);
  const [settings, setSettings] = useState<SiteSettings>({});
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [addUpdateFor, setAddUpdateFor] = useState<string | null>(null);

  // New incident form
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newStatus, setNewStatus] = useState<IncidentStatus>("investigating");
  const [newSeverity, setNewSeverity] = useState<IncidentSeverity>("minor");
  const [newFeatures, setNewFeatures] = useState("");
  const [newIsPrelaunch, setNewIsPrelaunch] = useState(false);

  // Add update form
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateStatus, setUpdateStatus] = useState<IncidentStatus>("investigating");

  // New maintenance form
  const [mTitle, setMTitle] = useState("");
  const [mDesc, setMDesc] = useState("");
  const [mStart, setMStart] = useState("");
  const [mEnd, setMEnd] = useState("");
  const [mServices, setMServices] = useState("");

  const authHeaders = useCallback(async () => {
    const token = await getToken();
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }, [getToken]);

  const fetchData = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const [incRes, settingsRes, maintRes] = await Promise.all([
        fetch(`${API_URL}/admin/status/incidents`, { headers }),
        fetch(`${API_URL}/admin/status/settings`, { headers }),
        fetch(`${API_URL}/admin/status/maintenance`, { headers }),
      ]);
      if (incRes.ok) setIncidents(await incRes.json() as Incident[]);
      else toast.error("Failed to load incidents");
      if (settingsRes.ok) setSettings(await settingsRes.json() as SiteSettings);
      else toast.error("Failed to load settings");
      if (maintRes.ok) setMaintenance(await maintRes.json() as MaintenanceWindow[]);
      else toast.error("Failed to load maintenance windows");
    } catch {
      toast.error("Failed to load status data");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  async function patchSetting(key: string, value: string) {
    const headers = await authHeaders();
    // Optimistic update
    setSettings((prev) => ({ ...prev, [key]: value }));
    const res = await fetch(`${API_URL}/admin/status/settings`, { method: "PATCH", headers, body: JSON.stringify({ key, value }) });
    if (!res.ok) {
      // Roll back and re-fetch real state
      await fetchData();
      toast.error("Failed to save setting. Please try again.");
    }
  }

  async function createIncident(e: React.FormEvent) {
    e.preventDefault();
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/admin/status/incidents`, {
      method: "POST", headers,
      body: JSON.stringify({
        title: newTitle, summary: newSummary, status: newStatus, severity: newSeverity,
        affected_features: newFeatures.split(",").map((s) => s.trim()).filter(Boolean),
        is_prelaunch_update: newIsPrelaunch,
      }),
    });
    if (res.ok) {
      setShowNewForm(false);
      setNewTitle(""); setNewSummary(""); setNewStatus("investigating");
      setNewSeverity("minor"); setNewFeatures(""); setNewIsPrelaunch(false);
      await fetchData();
    } else {
      toast.error("Failed to create incident");
    }
  }

  async function addUpdate(e: React.FormEvent, incidentId: string) {
    e.preventDefault();
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/admin/status/incidents/${incidentId}/updates`, {
      method: "POST", headers, body: JSON.stringify({ message: updateMessage, status: updateStatus }),
    });
    if (res.ok) {
      setAddUpdateFor(null); setUpdateMessage(""); setUpdateStatus("investigating");
      await fetchData();
    } else {
      toast.error("Failed to post update");
    }
  }

  async function patchIncidentStatus(id: string, status: IncidentStatus) {
    const headers = await authHeaders();
    await fetch(`${API_URL}/admin/status/incidents/${id}`, {
      method: "PATCH", headers, body: JSON.stringify({ status }),
    });
    await fetchData();
  }

  async function createMaintenance(e: React.FormEvent) {
    e.preventDefault();
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/admin/status/maintenance`, {
      method: "POST", headers,
      body: JSON.stringify({
        title: mTitle,
        description: mDesc || undefined,
        scheduled_start: new Date(mStart).toISOString(),
        scheduled_end: new Date(mEnd).toISOString(),
        affected_services: mServices.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    });
    if (res.ok) {
      setShowMaintenanceForm(false);
      setMTitle(""); setMDesc(""); setMStart(""); setMEnd(""); setMServices("");
      await fetchData();
    } else {
      toast.error("Failed to schedule maintenance");
    }
  }

  async function cancelMaintenance(id: string) {
    const headers = await authHeaders();
    await fetch(`${API_URL}/admin/status/maintenance/${id}`, { method: "DELETE", headers });
    await fetchData();
  }

  if (loading) {
    return (
      <DashboardShell title="Status Management" description="Manage incidents, maintenance windows, and prelaunch settings">
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-seafoam-400 border-t-transparent" />
        </div>
      </DashboardShell>
    );
  }

  const openIncidents = incidents.filter((i) => i.status !== "resolved");
  const autoOpen = openIncidents.filter((i) => i.auto_detected);

  return (
    <DashboardShell title="Status Management" description="Manage incidents, maintenance windows, and prelaunch settings">
      <div className="space-y-6">
        {/* Auto-detection summary bar */}
        {autoOpen.length > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800/30 dark:bg-red-900/20">
            <Bot className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              {autoOpen.length} auto-detected incident{autoOpen.length > 1 ? "s" : ""} currently open — review and update them below.
            </p>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex rounded-xl border border-slate-200 p-1 dark:border-slate-700 w-fit gap-1">
          {(["incidents", "maintenance", "settings"] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition ${tab === t ? "bg-seafoam-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Incidents Tab ───────────────────────────────────────────── */}
        {tab === "incidents" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-charcoal dark:text-white">Incidents</h2>
              <Button size="sm" onClick={() => setShowNewForm(!showNewForm)}>
                {showNewForm ? "Cancel" : "New Incident"}
              </Button>
            </div>

            {showNewForm && (
              <Card>
                <form onSubmit={(e) => void createIncident(e)} className="p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-charcoal dark:text-white">Create Incident</h3>
                  <Input label="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Summary</label>
                    <textarea value={newSummary} onChange={(e) => setNewSummary(e.target.value)} required rows={3} className={textareaCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                      <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as IncidentStatus)} className={selectCls}>
                        <option value="investigating">Investigating</option>
                        <option value="identified">Identified</option>
                        <option value="monitoring">Monitoring</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Severity</label>
                      <select value={newSeverity} onChange={(e) => setNewSeverity(e.target.value as IncidentSeverity)} className={selectCls}>
                        <option value="minor">Minor (&lt;10% users)</option>
                        <option value="moderate">Moderate (10–25%)</option>
                        <option value="major">Major (25–50%)</option>
                        <option value="critical">Critical (≥50%)</option>
                      </select>
                    </div>
                  </div>
                  <Input label="Affected features (comma-separated)" value={newFeatures} onChange={(e) => setNewFeatures(e.target.value)} />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newIsPrelaunch} onChange={(e) => setNewIsPrelaunch(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-seafoam-500 focus:ring-seafoam-400" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Prelaunch update</span>
                  </label>
                  <Button type="submit">Create Incident</Button>
                </form>
              </Card>
            )}

            {incidents.length === 0 && <p className="text-sm text-slate-500">No incidents yet.</p>}

            {incidents.map((incident) => (
              <Card key={incident.id}>
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-charcoal dark:text-white">{incident.title}</span>
                        <Badge text={incident.status} className={STATUS_COLORS[incident.status]} />
                        <Badge text={incident.severity} className={SEVERITY_COLORS[incident.severity]} />
                        {incident.auto_detected && (
                          <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                            <Bot className="h-3 w-3" /> Auto-detected
                          </span>
                        )}
                        {incident.is_prelaunch_update && (
                          <Badge text="prelaunch" className="bg-purple-100 text-purple-700" />
                        )}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{incident.summary}</p>
                      {incident.auto_detected && (incident.affected_user_count != null || incident.total_occurrences != null) && (
                        <p className="text-xs text-slate-400 mb-2">
                          {incident.affected_user_count != null && <span>{incident.affected_user_count} users affected · </span>}
                          {incident.total_occurrences != null && <span>{incident.total_occurrences} occurrences in 30 min</span>}
                        </p>
                      )}
                      {incident.affected_features.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {incident.affected_features.map((f) => (
                            <span key={f} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">{f}</span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-slate-400">Created {new Date(incident.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {incident.status !== "resolved" && (
                        <Button size="sm" variant="secondary" onClick={() => void patchIncidentStatus(incident.id, "resolved")}>
                          Resolve
                        </Button>
                      )}
                      <Button size="sm" variant="secondary"
                        onClick={() => setAddUpdateFor(addUpdateFor === incident.id ? null : incident.id)}>
                        Add Update
                      </Button>
                    </div>
                  </div>

                  {addUpdateFor === incident.id && (
                    <form onSubmit={(e) => void addUpdate(e, incident.id)}
                      className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-4 space-y-3">
                      <h4 className="text-sm font-medium text-charcoal dark:text-white">Add Timeline Update</h4>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                        <select value={updateStatus} onChange={(e) => setUpdateStatus(e.target.value as IncidentStatus)} className={selectCls}>
                          <option value="investigating">Investigating</option>
                          <option value="identified">Identified</option>
                          <option value="monitoring">Monitoring</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Message</label>
                        <textarea value={updateMessage} onChange={(e) => setUpdateMessage(e.target.value)} required rows={2} className={textareaCls} />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm">Post Update</Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => setAddUpdateFor(null)}>Cancel</Button>
                      </div>
                    </form>
                  )}

                  {incident.updates.length > 0 && (
                    <div className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-4">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Timeline</h4>
                      <div className="space-y-2">
                        {incident.updates.map((u) => (
                          <div key={u.id} className="flex gap-3 text-sm">
                            <span className="text-slate-400 whitespace-nowrap">{new Date(u.created_at).toLocaleString()}</span>
                            <Badge text={u.status} className={STATUS_COLORS[u.status as IncidentStatus] ?? "bg-slate-100 text-slate-700"} />
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
        )}

        {/* ── Maintenance Tab ─────────────────────────────────────────── */}
        {tab === "maintenance" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-charcoal dark:text-white">Scheduled Maintenance</h2>
              <Button size="sm" onClick={() => setShowMaintenanceForm(!showMaintenanceForm)}>
                {showMaintenanceForm ? "Cancel" : "Schedule Maintenance"}
              </Button>
            </div>

            {showMaintenanceForm && (
              <Card>
                <form onSubmit={(e) => void createMaintenance(e)} className="p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-charcoal dark:text-white">New Maintenance Window</h3>
                  <Input label="Title" value={mTitle} onChange={(e) => setMTitle(e.target.value)} required
                    placeholder="e.g. Scheduled database maintenance" />
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description (optional)</label>
                    <textarea value={mDesc} onChange={(e) => setMDesc(e.target.value)} rows={2} className={textareaCls}
                      placeholder="What will be affected and why…" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start</label>
                      <input type="datetime-local" required value={mStart} onChange={(e) => setMStart(e.target.value)}
                        className={selectCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End</label>
                      <input type="datetime-local" required value={mEnd} onChange={(e) => setMEnd(e.target.value)}
                        className={selectCls} />
                    </div>
                  </div>
                  <Input label="Affected services (comma-separated)" value={mServices} onChange={(e) => setMServices(e.target.value)}
                    placeholder="e.g. API, Customer App, Bookings" />
                  <Button type="submit">
                    <Wrench className="h-4 w-4 mr-1.5" />
                    Schedule
                  </Button>
                </form>
              </Card>
            )}

            {maintenance.length === 0 && <p className="text-sm text-slate-500">No maintenance windows scheduled.</p>}

            {maintenance.map((m) => (
              <Card key={m.id}>
                <div className="p-5 flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-charcoal dark:text-white">{m.title}</span>
                      <Badge text={m.status.replace("_", " ")} className={MAINTENANCE_STATUS_COLORS[m.status]} />
                    </div>
                    {m.description && <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{m.description}</p>}
                    <p className="text-xs text-slate-500">
                      {new Date(m.scheduled_start).toLocaleString()} → {new Date(m.scheduled_end).toLocaleString()}
                    </p>
                    {m.affected_services.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {m.affected_services.map((s) => (
                          <span key={s} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {m.status === "scheduled" && (
                    <Button size="sm" variant="danger" onClick={() => void cancelMaintenance(m.id)}>Cancel</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── Settings Tab ────────────────────────────────────────────── */}
        {tab === "settings" && (
          <Card>
            <div className="p-6">
              <h2 className="mb-4 text-base font-semibold text-charcoal dark:text-white">Prelaunch Settings</h2>
              <div className="space-y-4">
                {(
                  [
                    { key: "prelaunch_cleaner", label: "Cleaner app in prelaunch" },
                    { key: "prelaunch_customer", label: "Customer app in prelaunch" },
                  ] as { key: string; label: string }[]
                ).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={settings[key] === "true"}
                      onChange={(e) => void patchSetting(key, e.target.checked ? "true" : "false")}
                      className="h-4 w-4 rounded border-slate-300 text-seafoam-500 focus:ring-seafoam-400" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
