import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { GitPullRequest, RefreshCw, Plus } from "lucide-react";
import {
  DashboardShell,
  Card,
  Button,
  Badge,
  Select,
  Input,
  Textarea,
  Modal,
  EmptyState,
  toast,
} from "@sweepr/ui";
import { DataTable, type Column } from "../components/DataTable";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Proposal {
  id: string;
  title: string;
  status: string;
  fee_type: string;
  affected_party: string;
  proposed_effective_at: string;
  response_deadline_at: string;
  created_at: string;
}

const STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "error"> = {
  pending: "warning",
  collaboration: "info",
  cooldown: "info",
  notice_sent: "info",
  effective: "success",
  declined: "error",
  expired_declined: "error",
  cancelled: "error",
  revoked: "error",
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "collaboration", label: "In Collaboration" },
  { value: "cooldown", label: "Approved / Cooldown" },
  { value: "notice_sent", label: "Notice Scheduled" },
  { value: "effective", label: "Effective" },
  { value: "declined", label: "Declined" },
];

const FEE_TYPES = [
  "customer_service_fee", "platform_fee", "cleaner_commission", "insurance_admin_fee",
  "cancellation_fee", "reschedule_fee", "adjustment_fee", "marketplace_fee",
  "payment_processing_pass_through", "other",
].map((v) => ({ value: v, label: v.replace(/_/g, " ") }));

const PARTIES = ["customers", "cleaners", "both", "internal_only"].map((v) => ({ value: v, label: v.replace(/_/g, " ") }));
const METHODS = ["flat_amount", "percentage", "tiered_percentage", "dynamic_formula", "market_based", "city_based", "service_type_based"]
  .map((v) => ({ value: v, label: v.replace(/_/g, " ") }));

export function ApprovalsPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create form.
  const [form, setForm] = useState({
    name: "", fee_type: "platform_fee", affected_party: "cleaners", calculation_method: "percentage",
    amount: "", title: "", reason: "", internalNotes: "", externalNoticeSummary: "", proposedEffectiveAt: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authed(`/admin/fee-proposals${status ? `?status=${status}` : ""}`);
      if (res.ok) setRows(((await res.json()) as { proposals: Proposal[] }).proposals ?? []);
    } finally {
      setLoading(false);
    }
  }, [authed, status]);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    if (!form.name || !form.title || !form.reason || !form.proposedEffectiveAt) {
      return toast.error("Name, title, reason, and effective date are required.");
    }
    setSaving(true);
    try {
      const isPct = form.calculation_method === "percentage" || form.calculation_method === "tiered_percentage";
      const body = {
        feeConfig: {
          name: form.name,
          fee_type: form.fee_type,
          affected_party: form.affected_party,
          calculation_method: form.calculation_method,
          flat_amount_cents: !isPct && form.amount ? Math.round(parseFloat(form.amount) * 100) : null,
          percentage_bps: isPct && form.amount ? Math.round(parseFloat(form.amount) * 100) : null,
        },
        title: form.title,
        reason: form.reason,
        internalNotes: form.internalNotes || undefined,
        externalNoticeSummary: form.externalNoticeSummary || undefined,
        proposedEffectiveAt: new Date(form.proposedEffectiveAt).toISOString(),
      };
      const res = await authed("/admin/fee-proposals", { method: "POST", body: JSON.stringify(body) });
      if (res.ok) {
        toast.success("Proposal created. Super Admins notified.");
        setOpen(false);
        void load();
      } else {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(e.error ?? "Could not create proposal.");
      }
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<Proposal>[] = [
    { header: "Title", cell: (r) => <span className="font-medium text-charcoal dark:text-white">{r.title}</span> },
    { header: "Fee type", cell: (r) => r.fee_type?.replace(/_/g, " ") },
    { header: "Affects", cell: (r) => r.affected_party?.replace(/_/g, " ") },
    { header: "Effective", cell: (r) => r.proposed_effective_at ? new Date(r.proposed_effective_at).toLocaleDateString() : "—" },
    { header: "Status", cell: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? "info"}>{r.status.replace(/_/g, " ")}</Badge> },
    { header: "", align: "right", cell: (r) => <Button size="sm" variant="secondary" onClick={() => navigate(`/approvals/${r.id}`)}>Review</Button> },
  ];

  return (
    <DashboardShell
      title="Approvals"
      description="Super-Admin approval workflow for fee configuration changes."
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New proposal</Button>
        </div>
      }
    >
      <div className="mb-4 w-56">
        <Select options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-seafoam-400 border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<GitPullRequest className="h-10 w-10 text-seafoam-500" />}
          title="No proposals"
          description="Create a fee change proposal to start the Super-Admin approval workflow."
          action={<Button onClick={() => setOpen(true)}>New proposal</Button>}
        />
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Propose a fee change"
        description="Requires approval from you plus at least one other Super Admin, a 48-hour cooldown, and 14-day notice before it takes effect."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={saving}>Submit proposal</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Configuration name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Standard platform fee — 2026 Q3" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Fee type" options={FEE_TYPES} value={form.fee_type} onChange={(e) => set("fee_type", e.target.value)} />
            <Select label="Affected party" options={PARTIES} value={form.affected_party} onChange={(e) => set("affected_party", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Calculation method" options={METHODS} value={form.calculation_method} onChange={(e) => set("calculation_method", e.target.value)} />
            <Input
              label={form.calculation_method.includes("percentage") ? "Percentage (%)" : "Flat amount ($)"}
              type="number"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </div>
          <Input label="Title" value={form.title} onChange={(e) => set("title", e.target.value)} />
          <Textarea label="Reason" value={form.reason} onChange={(e) => set("reason", e.target.value)} />
          <Textarea label="Internal notes (optional)" value={form.internalNotes} onChange={(e) => set("internalNotes", e.target.value)} />
          <Textarea
            label="External notice summary (required if customer/cleaner-facing)"
            value={form.externalNoticeSummary}
            onChange={(e) => set("externalNoticeSummary", e.target.value)}
          />
          <Input
            label="Proposed effective date/time (must be ≥ 48h out)"
            type="datetime-local"
            value={form.proposedEffectiveAt}
            onChange={(e) => set("proposedEffectiveAt", e.target.value)}
          />
        </div>
      </Modal>
    </DashboardShell>
  );
}
