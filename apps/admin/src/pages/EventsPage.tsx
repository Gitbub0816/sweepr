import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Download, RefreshCw } from "lucide-react";
import { DashboardShell, Card, Select, Button, Badge } from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface AuditEvent {
  id: string;
  action: string;
  actor_clerk_id: string;
  target_type: string;
  target_id: string;
  ip_address?: string | null;
  created_at: string;
}

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "booking.created", label: "booking.created" },
  { value: "booking.status_changed", label: "booking.status_changed" },
  { value: "payment.captured", label: "payment.captured" },
  { value: "payout.released", label: "payout.released" },
  { value: "dispute.opened", label: "dispute.opened" },
  { value: "cleaner.approved", label: "cleaner.approved" },
  { value: "cleaner.rejected", label: "cleaner.rejected" },
  { value: "cleaner.suspended", label: "cleaner.suspended" },
  { value: "data.export_requested", label: "data.export_requested" },
  { value: "data.deleted", label: "data.deleted" },
];

function actionVariant(action: string): "error" | "success" | "info" | "warning" {
  if (
    action.startsWith("dispute") ||
    action.includes("suspended") ||
    action.includes("rejected") ||
    action.startsWith("data.")
  )
    return "error";
  if (action.startsWith("payment") || action.startsWith("payout"))
    return "success";
  if (action.startsWith("booking")) return "info";
  return "warning";
}

export function EventsPage() {
  const { getToken } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!API_URL) return;
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ limit: "100" });
      if (action) params.set("action", action);
      const res = await fetch(`${API_URL}/admin/events?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = (await res.json()) as { events: AuditEvent[]; total: number };
        setEvents(data.events ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {
      // leave existing data in place
    } finally {
      setLoading(false);
    }
  }, [action, getToken]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const csv = useMemo(() => {
    const header = "timestamp,action,actor,target,ip";
    const rows = events.map((e) =>
      [
        e.created_at,
        e.action,
        e.actor_clerk_id,
        `${e.target_type}:${e.target_id}`,
        e.ip_address ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    return [header, ...rows].join("\n");
  }, [events]);

  function exportCsv() {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-events-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DashboardShell
      title="Events"
      description={`Live audit log — ${total} total events (refreshes every 10s).`}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={load} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      }
    >
      <Card>
        <div className="mb-4 max-w-xs">
          <Select
            label="Filter by action"
            options={ACTION_OPTIONS}
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </div>

        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No events to display.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-2 pr-4">Timestamp</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">Target</th>
                  <th className="py-2 pr-4">IP</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr
                    key={e.id}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-2 pr-4 text-slate-500">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={actionVariant(e.action)}>{e.action}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                      {e.actor_clerk_id}
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                      {e.target_type}:{e.target_id}
                    </td>
                    <td className="py-2 pr-4 text-slate-400">
                      {e.ip_address ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </DashboardShell>
  );
}
