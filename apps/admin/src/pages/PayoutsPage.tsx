import { useState, useEffect, useCallback } from "react";
import {
  DashboardShell,
  Badge,
  Button,
  StatCard,
  toast,
} from "@sweepr/ui";
import {
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Settings,
  Users,
  DollarSign,
  ShieldAlert,
  ArrowUpRight,
} from "lucide-react";
import { formatCurrency } from "@sweepr/utils";
import { DataTable, type Column } from "../components/DataTable";
import { useAuth } from "@clerk/clerk-react";

const API = import.meta.env.VITE_API_URL ?? "";

type Tab = "overview" | "transactions" | "payouts" | "fee-config" | "contractor-earnings" | "disputes" | "settings";

const STATUS_VARIANT: Record<string, "success" | "warning" | "error" | "info"> = {
  paid: "success",
  transferred: "success",
  scheduled: "info",
  pending: "warning",
  failed: "error",
  canceled: "error",
  held: "warning",
  disputed: "error",
  refunded: "warning",
};

function useApi<T>(path: string, deps: unknown[] = []) {
  const { getToken } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data } = useApi<Record<string, { amount: number; count: number } | unknown>>("/admin/payouts/overview");

  if (!data) return <div className="animate-pulse h-40 bg-slate-100 rounded-xl" />;

  const d = data as Record<string, { amount: number; count: number }>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pending" value={formatCurrency((d.pending?.amount ?? 0) / 100)} icon={Clock}
          delta={`${d.pending?.count ?? 0} payouts`} />
        <StatCard label="Scheduled" value={formatCurrency((d.scheduled?.amount ?? 0) / 100)} icon={ArrowUpRight}
          delta={`${d.scheduled?.count ?? 0} payouts`} />
        <StatCard label="Total Paid" value={formatCurrency((d.total?.amount ?? 0) / 100)} icon={CheckCircle2}
          delta={`${d.total?.count ?? 0} transfers`} />
        <StatCard label="Disputed / Held" value={String((d.disputed?.count ?? 0) + (d.held?.count ?? 0))} icon={ShieldAlert}
          delta="Needs review" />
      </div>
      {d.failed && d.failed.count > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>{d.failed.count} failed payouts</strong> totalling {formatCurrency(d.failed.amount / 100)} need attention.
        </div>
      )}
    </div>
  );
}

// ─── Transactions ─────────────────────────────────────────────────────────────

interface TxRow {
  id: string;
  booking_id: string;
  cleaner_name: string;
  gross_amount: number;
  platform_fee: number;
  amount: number;
  fee_rate: number;
  tier_multiplier: number;
  status: string;
  stripe_transfer_id: string | null;
  scheduled_date: string;
  created_at: string;
}

function TransactionsTab() {
  const { data, loading } = useApi<{ rows: TxRow[]; total: number }>("/admin/payouts/transactions?limit=100");

  const cols: Column<TxRow>[] = [
    { header: "Cleaner", cell: (r) => <span className="font-medium">{r.cleaner_name}</span> },
    { header: "Date", cell: (r) => new Date(r.created_at).toLocaleDateString() },
    { header: "Gross", align: "right", cell: (r) => formatCurrency((r.gross_amount ?? 0) / 100) },
    { header: "Platform Fee", align: "right", cell: (r) => formatCurrency((r.platform_fee ?? 0) / 100) },
    { header: "Cleaner Net", align: "right", cell: (r) => <span className="font-semibold">{formatCurrency((r.amount ?? 0) / 100)}</span> },
    { header: "Rate", align: "right", cell: (r) => r.fee_rate ? `${(Number(r.fee_rate) * 100).toFixed(1)}%` : "—" },
    { header: "Tier ×", align: "right", cell: (r) => r.tier_multiplier ? `${Number(r.tier_multiplier).toFixed(3)}` : "1.000" },
    { header: "Status", cell: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? "warning"}>{r.status}</Badge> },
    { header: "Transfer ID", cell: (r) => r.stripe_transfer_id ? <code className="text-xs">{r.stripe_transfer_id}</code> : "—" },
  ];

  return loading
    ? <div className="animate-pulse h-40 bg-slate-100 rounded-xl" />
    : <DataTable columns={cols} rows={data?.rows ?? []} />;
}

// ─── Payouts list ─────────────────────────────────────────────────────────────

interface PayoutRow {
  id: string;
  booking_id: string;
  cleaner_name: string;
  amount: number;
  status: string;
  scheduled_for: string | null;
  paid_at: string | null;
  held_reason: string | null;
  dispute_id: string | null;
  stripe_transfer_id: string | null;
}

function PayoutsListTab() {
  const { getToken } = useAuth();
  const { data, loading, reload } = useApi<{ rows: PayoutRow[] }>("/admin/payouts/payouts?limit=100");
  const [acting, setActing] = useState<string | null>(null);

  async function hold(id: string) {
    const reason = window.prompt("Reason for hold:");
    if (!reason) return;
    setActing(id);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/payouts/hold/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error();
      toast.success("Payout held.");
      reload();
    } catch { toast.error("Failed."); }
    finally { setActing(null); }
  }

  async function release(id: string) {
    setActing(id);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/payouts/release/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      toast.success("Payout released.");
      reload();
    } catch { toast.error("Failed."); }
    finally { setActing(null); }
  }

  const cols: Column<PayoutRow>[] = [
    { header: "Cleaner", cell: (r) => <span className="font-medium">{r.cleaner_name}</span> },
    { header: "Amount", align: "right", cell: (r) => formatCurrency(r.amount / 100) },
    { header: "Status", cell: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? "warning"}>{r.status}</Badge> },
    { header: "Scheduled", cell: (r) => r.scheduled_for ? new Date(r.scheduled_for).toLocaleDateString() : "—" },
    { header: "Paid", cell: (r) => r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "—" },
    { header: "Hold Reason", cell: (r) => r.held_reason ?? "—" },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex gap-2 justify-end">
          {(r.status === "pending" || r.status === "scheduled") && (
            <Button size="sm" onClick={() => release(r.id)} loading={acting === r.id}>Release</Button>
          )}
          {r.status !== "held" && r.status !== "paid" && r.status !== "transferred" && (
            <Button size="sm" variant="secondary" onClick={() => hold(r.id)} loading={acting === r.id}>Hold</Button>
          )}
        </div>
      ),
    },
  ];

  return loading
    ? <div className="animate-pulse h-40 bg-slate-100 rounded-xl" />
    : <DataTable columns={cols} rows={data?.rows ?? []} />;
}

// ─── Fee Configuration ────────────────────────────────────────────────────────

interface FeeConfig {
  fee_type: string;
  fee_value: number;
  minimum_platform_fee: number;
  maximum_platform_fee: number | null;
  processing_fee_strategy: string;
  processing_fee_split_pct: number;
  reserve_percentage: number;
  payout_delay_days: number;
  notes: string | null;
}

function FeeConfigTab() {
  const { getToken } = useAuth();
  const { data, reload } = useApi<FeeConfig>("/admin/payouts/fee-config");
  const [form, setForm] = useState<FeeConfig | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm({ ...data }); }, [data]);

  if (!form) return <div className="animate-pulse h-40 bg-slate-100 rounded-xl" />;

  function field(k: keyof FeeConfig, type: "text" | "number" = "number") {
    return (
      <input
        type={type}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={String(form![k] ?? "")}
        onChange={(e) => setForm((f) => f ? { ...f, [k]: type === "number" ? Number(e.target.value) : e.target.value } : f)}
      />
    );
  }

  async function save() {
    if (!reason.trim()) { toast.error("Reason required."); return; }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/payouts/fee-config`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          feeType: form!.fee_type,
          feeValue: form!.fee_value,
          minimumPlatformFee: form!.minimum_platform_fee,
          maximumPlatformFee: form!.maximum_platform_fee,
          processingFeeStrategy: form!.processing_fee_strategy,
          processingFeeSplitPct: form!.processing_fee_split_pct,
          reservePercentage: form!.reserve_percentage,
          payoutDelayDays: form!.payout_delay_days,
          notes: form!.notes,
          reason,
        }),
      });
      if (!res.ok) throw new Error();
      const body = await res.json() as { proposalId?: string };
      toast.success("Fee change proposal submitted — pending approval.");
      setReason("");
      reload();
      if (body.proposalId) {
        window.location.href = `/approvals/${body.proposalId}`;
      }
    } catch { toast.error("Save failed."); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">Platform Fee</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Fee Type</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.fee_type}
              onChange={(e) => setForm((f) => f ? { ...f, fee_type: e.target.value } : f)}
            >
              <option value="percentage">Percentage</option>
              <option value="flat">Flat</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              {form.fee_type === "flat" ? "Fee (cents)" : "Fee %"}
            </label>
            {field("fee_value")}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Min Fee (cents)</label>
            {field("minimum_platform_fee")}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Max Fee (cents, blank=uncapped)</label>
            <input
              type="number"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.maximum_platform_fee ?? ""}
              onChange={(e) => setForm((f) => f ? { ...f, maximum_platform_fee: e.target.value ? Number(e.target.value) : null } : f)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">Processing &amp; Payout</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Processing Fee Strategy</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.processing_fee_strategy}
              onChange={(e) => setForm((f) => f ? { ...f, processing_fee_strategy: e.target.value } : f)}
            >
              <option value="absorb">Absorb (platform pays)</option>
              <option value="pass_through">Pass Through (customer pays)</option>
              <option value="split">Split</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Split % to customer</label>
            {field("processing_fee_split_pct")}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Reserve %</label>
            {field("reserve_percentage")}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Payout Delay (days)</label>
            {field("payout_delay_days")}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">Submit for Approval</h3>
        <p className="text-xs text-slate-500">Fee configuration changes require Super Admin authorization. Provide a reason before submitting.</p>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Reason for change (required)</label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="e.g. Adjusting for Q3 pricing review"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Button onClick={save} loading={saving}>Submit for Approval</Button>
      </div>
    </div>
  );
}

// ─── Contractor Earnings ──────────────────────────────────────────────────────

interface EarningsRow {
  id: string;
  name: string;
  tier: string | null;
  stripe_connect_id: string | null;
  payout_count: number;
  total_paid: number;
  total_platform_fee: number;
  total_gross: number;
  avg_fee_rate: number;
  last_paid_at: string | null;
}

function ContractorEarningsTab() {
  const { data, loading } = useApi<{ rows: EarningsRow[] }>("/admin/payouts/contractor-earnings");

  const cols: Column<EarningsRow>[] = [
    { header: "Cleaner", cell: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Tier", cell: (r) => r.tier ? <Badge variant="info">{r.tier}</Badge> : "—" },
    { header: "Payouts", align: "right", cell: (r) => String(r.payout_count) },
    { header: "Gross", align: "right", cell: (r) => formatCurrency(Number(r.total_gross) / 100) },
    { header: "Platform Fee", align: "right", cell: (r) => formatCurrency(Number(r.total_platform_fee) / 100) },
    { header: "Total Earned", align: "right", cell: (r) => <span className="font-semibold text-green-700">{formatCurrency(Number(r.total_paid) / 100)}</span> },
    { header: "Avg Rate", align: "right", cell: (r) => r.avg_fee_rate ? `${(Number(r.avg_fee_rate) * 100).toFixed(1)}%` : "—" },
    { header: "Last Paid", cell: (r) => r.last_paid_at ? new Date(r.last_paid_at).toLocaleDateString() : "—" },
    { header: "Connect", cell: (r) => r.stripe_connect_id ? <span className="text-green-600 text-xs">Linked</span> : <span className="text-red-500 text-xs">Missing</span> },
  ];

  return loading
    ? <div className="animate-pulse h-40 bg-slate-100 rounded-xl" />
    : <DataTable columns={cols} rows={data?.rows ?? []} />;
}

// ─── Disputes ─────────────────────────────────────────────────────────────────

interface DisputeRow {
  id: string;
  booking_id: string;
  cleaner_name: string;
  amount: number;
  status: string;
  dispute_id: string | null;
  held_reason: string | null;
  created_at: string;
}

function DisputesTab() {
  const { getToken } = useAuth();
  const { data, loading, reload } = useApi<{ rows: DisputeRow[] }>("/admin/payouts/disputes");
  const [acting, setActing] = useState<string | null>(null);

  async function resolve(id: string, resolution: "release" | "cancel") {
    let notes = "";
    if (resolution === "cancel") {
      const prompted = window.prompt("Cancellation notes (optional):");
      if (prompted === null) return;
      notes = prompted;
    }
    setActing(id);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/payouts/disputes/${id}/resolve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, notes }),
      });
      if (!res.ok) throw new Error();
      toast.success(resolution === "release" ? "Payout released." : "Payout canceled.");
      reload();
    } catch { toast.error("Failed."); }
    finally { setActing(null); }
  }

  const cols: Column<DisputeRow>[] = [
    { header: "Cleaner", cell: (r) => <span className="font-medium">{r.cleaner_name}</span> },
    { header: "Amount", align: "right", cell: (r) => formatCurrency(r.amount / 100) },
    { header: "Status", cell: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? "warning"}>{r.status}</Badge> },
    { header: "Dispute ID", cell: (r) => r.dispute_id ? <code className="text-xs">{r.dispute_id}</code> : "—" },
    { header: "Hold Reason", cell: (r) => r.held_reason ?? "—" },
    { header: "Date", cell: (r) => new Date(r.created_at).toLocaleDateString() },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex gap-2 justify-end">
          <Button size="sm" onClick={() => resolve(r.id, "release")} loading={acting === r.id}>Release</Button>
          <Button size="sm" variant="secondary" onClick={() => resolve(r.id, "cancel")} loading={acting === r.id}>Cancel</Button>
        </div>
      ),
    },
  ];

  return loading
    ? <div className="animate-pulse h-40 bg-slate-100 rounded-xl" />
    : (
      <div className="space-y-4">
        {(!data?.rows || data.rows.length === 0) && (
          <div className="rounded-lg border border-slate-200 p-8 text-center text-slate-400 text-sm">
            No disputes or holds at this time.
          </div>
        )}
        {data?.rows && data.rows.length > 0 && <DataTable columns={cols} rows={data.rows} />}
      </div>
    );
}

// ─── Settings (tiers + audit) ─────────────────────────────────────────────────

interface TierRow { tier: string; multiplier: number; label: string; description: string | null; }
interface AuditRow { id: string; actor_name: string; setting_name: string; old_value: string | null; new_value: string | null; reason: string | null; created_at: string; }

function SettingsTab() {
  const { getToken } = useAuth();
  const { data: tiers, reload: reloadTiers } = useApi<TierRow[]>("/admin/payouts/tiers");
  const { data: auditData } = useApi<{ rows: AuditRow[] }>("/admin/payouts/settings-audit?limit=30");
  const [editing, setEditing] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (tiers) {
      const m: Record<string, number> = {};
      (tiers as TierRow[]).forEach((t) => { m[t.tier] = Number(t.multiplier); });
      setEditing(m);
    }
  }, [tiers]);

  async function saveTier(tier: string) {
    const reason = window.prompt("Reason for change:");
    if (!reason) return;
    setSaving(tier);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/payouts/tiers/${tier}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ multiplier: editing[tier], reason }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${tier} multiplier updated.`);
      reloadTiers();
    } catch { toast.error("Failed."); }
    finally { setSaving(null); }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2"><TrendingUp size={16} /> Cleaner Tier Multipliers</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {(tiers as TierRow[] ?? []).map((t) => (
            <div key={t.tier} className="rounded-lg border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium capitalize">{t.label}</span>
                <Badge variant="info">{t.tier}</Badge>
              </div>
              <p className="text-xs text-slate-500">{t.description}</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.001"
                  min="0.5"
                  max="3"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  value={editing[t.tier] ?? Number(t.multiplier)}
                  onChange={(e) => setEditing((m) => ({ ...m, [t.tier]: Number(e.target.value) }))}
                />
                <Button size="sm" onClick={() => saveTier(t.tier)} loading={saving === t.tier}>Save</Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">Settings Audit Trail</h3>
        {auditData?.rows && auditData.rows.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="pb-2 pr-4">Actor</th>
                <th className="pb-2 pr-4">Setting</th>
                <th className="pb-2 pr-4">Old</th>
                <th className="pb-2 pr-4">New</th>
                <th className="pb-2 pr-4">Reason</th>
                <th className="pb-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {auditData.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="py-2 pr-4 font-medium">{r.actor_name}</td>
                  <td className="py-2 pr-4 font-mono">{r.setting_name}</td>
                  <td className="py-2 pr-4 text-red-600">{r.old_value ?? "—"}</td>
                  <td className="py-2 pr-4 text-green-600">{r.new_value ?? "—"}</td>
                  <td className="py-2 pr-4 text-slate-500">{r.reason ?? "—"}</td>
                  <td className="py-2 text-slate-400">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400">No changes recorded yet.</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview",             label: "Overview",            icon: Wallet },
  { id: "transactions",         label: "Transactions",        icon: DollarSign },
  { id: "payouts",              label: "Payouts",             icon: CheckCircle2 },
  { id: "fee-config",           label: "Fee Configuration",   icon: Settings },
  { id: "contractor-earnings",  label: "Contractor Earnings", icon: Users },
  { id: "disputes",             label: "Disputes",            icon: ShieldAlert },
  { id: "settings",             label: "Settings",            icon: TrendingUp },
];

export function PayoutsPage() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <DashboardShell title="Payouts" description="Stripe Connect marketplace & payout administration.">
      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-0 -mb-px">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="pt-2">
        {tab === "overview"            && <OverviewTab />}
        {tab === "transactions"        && <TransactionsTab />}
        {tab === "payouts"             && <PayoutsListTab />}
        {tab === "fee-config"          && <FeeConfigTab />}
        {tab === "contractor-earnings" && <ContractorEarningsTab />}
        {tab === "disputes"            && <DisputesTab />}
        {tab === "settings"            && <SettingsTab />}
      </div>
    </DashboardShell>
  );
}
