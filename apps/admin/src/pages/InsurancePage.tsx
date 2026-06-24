import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Badge, Button, Card, EmptyState } from "@sweepr/ui";
import { DataTable, type Column } from "../components/DataTable";

const API = import.meta.env.VITE_API_URL ?? "";

interface PolicyRow {
  id: string;
  cleaner_id: string;
  first_name: string;
  last_name: string;
  email: string;
  policy_status: string;
  insurer_name?: string;
  policy_number?: string;
  coverage_amount_usd?: number;
  policy_expires_at?: string;
  doc_uploaded_at?: string;
  review_notes?: string;
}

const STATUS_BADGE: Record<string, "warning" | "success" | "error" | "default"> = {
  pending_review: "warning",
  active: "success",
  rejected: "error",
  expired: "error",
  expiring_soon: "warning",
};

export function InsurancePage() {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending_review");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function load(status: string) {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/insurance?status=${status}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { policies: PolicyRow[] };
      setRows(data.policies ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(filter); }, [filter]);

  async function decide(cleanerId: string, decision: "approved" | "rejected") {
    const token = await getToken();
    await fetch(`${API}/admin/insurance/${cleanerId}/review`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: note || undefined }),
    });
    setReviewing(null);
    setNote("");
    load(filter);
  }

  const columns: Column<PolicyRow>[] = [
    {
      header: "Cleaner",
      cell: (r) => (
        <div>
          <p className="font-medium text-charcoal">{r.first_name} {r.last_name}</p>
          <p className="text-xs text-slate-400">{r.email}</p>
        </div>
      ),
    },
    { header: "Insurer", cell: (r) => r.insurer_name ?? "—" },
    { header: "Policy #", cell: (r) => r.policy_number ?? "—" },
    {
      header: "Coverage",
      align: "right",
      cell: (r) =>
        r.coverage_amount_usd
          ? `$${(r.coverage_amount_usd / 1_000_000).toFixed(1)}M`
          : "—",
    },
    {
      header: "Expires",
      cell: (r) =>
        r.policy_expires_at
          ? new Date(r.policy_expires_at).toLocaleDateString()
          : "—",
    },
    {
      header: "Uploaded",
      cell: (r) =>
        r.doc_uploaded_at
          ? new Date(r.doc_uploaded_at).toLocaleDateString()
          : "—",
    },
    {
      header: "Status",
      cell: (r) => (
        <Badge variant={STATUS_BADGE[r.policy_status] ?? "default"}>
          {r.policy_status.replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      header: "",
      align: "right",
      cell: (r) =>
        filter === "pending_review" ? (
          <Button size="sm" onClick={() => { setReviewing(r.cleaner_id); setNote(""); }}>
            Review
          </Button>
        ) : null,
    },
  ];

  return (
    <DashboardShell
      title="Insurance Review"
      description="Review cleaner personal policy submissions."
    >
      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {["pending_review", "active", "rejected", "expired"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filter === s
                ? "border-seafoam-500 text-seafoam-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No submissions"
          description={`No policies with status "${filter.replace(/_/g, " ")}"`}
        />
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      {/* Review modal */}
      {reviewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md space-y-4">
            <h3 className="font-semibold text-charcoal">Review Policy Submission</h3>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Note (optional — required on rejection)
              </label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
                placeholder="Reason for rejection, or approval note…"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setReviewing(null)}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                fullWidth
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => decide(reviewing, "rejected")}
              >
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
              <Button fullWidth onClick={() => decide(reviewing, "approved")}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
              </Button>
            </div>
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}
