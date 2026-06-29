import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { DollarSign, Plus, Copy, RefreshCw, Calculator } from "lucide-react";
import { DashboardShell, Card, Button, Badge, Select, Input, toast } from "@sweepr/ui";
import { DataTable, type Column } from "../components/DataTable";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Rule { id: string; name: string; status: string; version: number; market_city: string | null; market_state: string | null; base_fee_cents: number; minimum_booking_price_cents: number; created_at: string; }
interface Proposal { id: string; title: string; status: string; rule_name: string; proposed_effective_at: string; }

const RULE_STATUS: Record<string, "info" | "warning" | "success" | "error"> = {
  draft: "warning", pending_approval: "info", active: "success", superseded: "error", archived: "error",
};
const PROP_STATUS: Record<string, "info" | "warning" | "success" | "error"> = {
  pending: "warning", collaboration: "info", cooldown: "info", notice_sent: "info", effective: "success",
  declined: "error", expired_declined: "error", cancelled: "error", revoked: "error",
};

export function PricingPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [rules, setRules] = useState<Rule[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  const [sim, setSim] = useState({ squareFeet: "1500", bedrooms: "3", bathrooms: "2", halfBathrooms: "0", serviceType: "deep_cleaning", cleaningIntensity: "normal", petsPresent: false, recurringFrequency: "one_time" });
  const [simResult, setSimResult] = useState<{ customer_total_cents: number; estimated_cleaner_payout_cents: number; estimated_platform_revenue_cents: number; requires_custom_quote: boolean; warnings: string[]; line_items: Array<{ label: string; cents: number }> } | null>(null);
  const setS = (k: string, v: string | boolean) => setSim((s) => ({ ...s, [k]: v }));

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([authed("/admin/pricing/rules"), authed("/admin/pricing/proposals")]);
      if (r.ok) setRules(((await r.json()) as { rules: Rule[] }).rules ?? []);
      if (p.ok) setProposals(((await p.json()) as { proposals: Proposal[] }).proposals ?? []);
    } finally { setLoading(false); }
  }, [authed]);

  useEffect(() => { void load(); }, [load]);

  async function newRule(cloneFrom?: string) {
    const res = await authed("/admin/pricing/rules", { method: "POST", body: JSON.stringify({ name: cloneFrom ? "Cloned pricing rule" : "New pricing rule", cloneFrom }) });
    if (res.ok) { const { id } = (await res.json()) as { id: string }; navigate(`/pricing/rules/${id}`); }
    else toast.error("Could not create rule.");
  }

  async function simulate() {
    const input: Record<string, unknown> = {
      squareFeet: Number(sim.squareFeet) || 0, bedrooms: Number(sim.bedrooms) || 0,
      bathrooms: Number(sim.bathrooms) || 0, halfBathrooms: Number(sim.halfBathrooms) || 0,
      serviceType: sim.serviceType, cleaningIntensity: sim.cleaningIntensity,
      petsPresent: sim.petsPresent, recurringFrequency: sim.recurringFrequency,
    };
    const res = await authed("/admin/pricing/simulate", { method: "POST", body: JSON.stringify({ input }) });
    if (res.ok) {
      const d = (await res.json()) as { proposed: typeof simResult };
      if (!d.proposed) { toast.error("No active pricing rule to simulate against. Create and activate one."); setSimResult(null); }
      else setSimResult(d.proposed);
    } else toast.error("Simulation failed.");
  }

  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

  const ruleCols: Column<Rule>[] = [
    { header: "Name", cell: (r) => <span className="font-medium text-charcoal dark:text-white">{r.name}</span> },
    { header: "Market", cell: (r) => [r.market_city, r.market_state].filter(Boolean).join(", ") || "Default" },
    { header: "Base", cell: (r) => fmt(r.base_fee_cents) },
    { header: "Min", cell: (r) => fmt(r.minimum_booking_price_cents) },
    { header: "v", cell: (r) => r.version },
    { header: "Status", cell: (r) => <Badge variant={RULE_STATUS[r.status] ?? "info"}>{r.status.replace(/_/g, " ")}</Badge> },
    { header: "", align: "right", cell: (r) => <Button size="sm" variant="secondary" onClick={() => navigate(`/pricing/rules/${r.id}`)}>{r.status === "draft" ? "Edit" : "View"}</Button> },
  ];
  const propCols: Column<Proposal>[] = [
    { header: "Title", cell: (r) => <span className="font-medium text-charcoal dark:text-white">{r.title}</span> },
    { header: "Rule", cell: (r) => r.rule_name },
    { header: "Effective", cell: (r) => r.proposed_effective_at ? new Date(r.proposed_effective_at).toLocaleDateString() : "—" },
    { header: "Status", cell: (r) => <Badge variant={PROP_STATUS[r.status] ?? "info"}>{r.status.replace(/_/g, " ")}</Badge> },
    { header: "", align: "right", cell: (r) => <Button size="sm" variant="secondary" onClick={() => navigate(`/pricing/approvals/${r.id}`)}>Review</Button> },
  ];

  const activeRule = rules.find((r) => r.status === "active");

  return (
    <DashboardShell
      title="Pricing"
      description="Algorithmic cleaning pricing. Edit drafts, simulate, and submit changes through Super-Admin approval."
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
          {activeRule && <Button size="sm" variant="secondary" onClick={() => newRule(activeRule.id)}><Copy className="h-4 w-4" /> Clone active</Button>}
          <Button size="sm" onClick={() => newRule()}><Plus className="h-4 w-4" /> New rule</Button>
        </div>
      }
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-charcoal dark:text-white"><DollarSign className="h-4 w-4" /> Pricing rules</h2>
          {rules.length === 0 ? <Card><p className="text-sm text-slate-400">No pricing rules yet. Create one to begin.</p></Card> : <DataTable columns={ruleCols} rows={rules} />}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-charcoal dark:text-white"><Calculator className="h-4 w-4" /> Simulator (active rule)</h2>
          <Card className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <Input label="Sq ft" type="number" value={sim.squareFeet} onChange={(e) => setS("squareFeet", e.target.value)} />
              <Input label="Bedrooms" type="number" value={sim.bedrooms} onChange={(e) => setS("bedrooms", e.target.value)} />
              <Input label="Bathrooms" type="number" value={sim.bathrooms} onChange={(e) => setS("bathrooms", e.target.value)} />
              <Input label="Half baths" type="number" value={sim.halfBathrooms} onChange={(e) => setS("halfBathrooms", e.target.value)} />
              <Select label="Service" options={["standard_cleaning", "deep_cleaning", "move_in_move_out", "post_construction", "short_term_rental_turnover"].map((v) => ({ value: v, label: v.replace(/_/g, " ") }))} value={sim.serviceType} onChange={(e) => setS("serviceType", e.target.value)} />
              <Select label="Intensity" options={["light", "normal", "heavy", "extreme"].map((v) => ({ value: v, label: v }))} value={sim.cleaningIntensity} onChange={(e) => setS("cleaningIntensity", e.target.value)} />
              <Select label="Frequency" options={["one_time", "weekly", "biweekly", "monthly"].map((v) => ({ value: v, label: v.replace(/_/g, " ") }))} value={sim.recurringFrequency} onChange={(e) => setS("recurringFrequency", e.target.value)} />
              <Select label="Pets" options={[{ value: "no", label: "No pets" }, { value: "yes", label: "Has pets" }]} value={sim.petsPresent ? "yes" : "no"} onChange={(e) => setS("petsPresent", e.target.value === "yes")} />
            </div>
            <Button size="sm" onClick={simulate}>Run simulation</Button>
            {simResult && (
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex flex-wrap gap-6">
                  <div><p className="text-xs text-slate-400">Customer total</p><p className="text-lg font-bold text-charcoal dark:text-white">{fmt(simResult.customer_total_cents)}</p></div>
                  <div><p className="text-xs text-slate-400">Est. cleaner payout</p><p className="text-lg font-semibold text-charcoal dark:text-white">{fmt(simResult.estimated_cleaner_payout_cents)}</p></div>
                  <div><p className="text-xs text-slate-400">Est. platform</p><p className="text-lg font-semibold text-charcoal dark:text-white">{fmt(simResult.estimated_platform_revenue_cents)}</p></div>
                  {simResult.requires_custom_quote && <Badge variant="warning">Custom quote</Badge>}
                </div>
                <div className="mt-3 space-y-0.5">
                  {simResult.line_items.map((li, i) => (
                    <div key={i} className="flex justify-between text-sm text-slate-500"><span>{li.label}</span><span>{fmt(li.cents)}</span></div>
                  ))}
                </div>
                {simResult.warnings.length > 0 && <p className="mt-2 text-xs text-amber-600">{simResult.warnings.join(" ")}</p>}
              </div>
            )}
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">Pricing change approvals</h2>
          {proposals.length === 0 ? <Card><p className="text-sm text-slate-400">No pricing proposals.</p></Card> : <DataTable columns={propCols} rows={proposals} />}
        </section>
      </div>
    </DashboardShell>
  );
}
