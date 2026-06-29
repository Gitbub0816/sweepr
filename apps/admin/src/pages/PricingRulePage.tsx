import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, Save, Send } from "lucide-react";
import { DashboardShell, Card, Button, Badge, Input, Select, Textarea, Modal, toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

type Rule = Record<string, unknown> & { id: string; status: string; name: string };

const BOOL = [{ value: "yes", label: "Enabled" }, { value: "no", label: "Disabled" }];

export function PricingRulePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [rule, setRule] = useState<Rule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [prop, setProp] = useState({ title: "", reason: "", proposedEffectiveAt: "", externalNoticeSummary: "", affectsParties: true });

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  }, [getToken]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await authed(`/admin/pricing/rules/${id}`);
      if (res.ok) setRule(((await res.json()) as { rule: Rule }).rule);
    } finally { setLoading(false); }
  }, [id, authed]);

  useEffect(() => { void load(); }, [load]);

  const editable = rule?.status === "draft";
  const set = (k: string, v: unknown) => setRule((r) => (r ? { ...r, [k]: v } : r));
  const num = (k: string) => (rule?.[k] == null ? "" : String(rule[k]));
  const json = (k: string) => (rule?.[k] == null ? "" : JSON.stringify(rule[k], null, 0));

  async function save() {
    if (!rule || !editable) return;
    setSaving(true);
    try {
      // Whitelisted payload; JSON fields parsed.
      const body: Record<string, unknown> = {};
      const scalars = ["name", "description", "market_city", "market_state", "market_zip",
        "base_fee_cents", "minimum_booking_price_cents", "maximum_booking_price_cents",
        "sqft_pricing_enabled", "sqft_included_in_base", "sqft_overage_rate_cents_per_sqft", "sqft_custom_quote_threshold",
        "bedrooms_included_in_base", "price_per_extra_bedroom_cents",
        "bathrooms_included_in_base", "price_per_extra_bathroom_cents", "half_bathroom_price_cents",
        "distance_pricing_enabled", "free_distance_miles", "price_per_mile_cents", "long_distance_surcharge_cents", "maximum_service_distance_miles",
        "pet_pricing_enabled", "pet_base_fee_cents", "price_per_pet_cents", "max_pet_count_before_custom_quote",
        "urgency_pricing_enabled", "recurring_discount_enabled",
        "rounding_enabled", "rounding_strategy", "rounding_increment_cents", "rounding_ending_cents",
        "requires_custom_quote_above_cents", "max_discount_bps"];
      for (const k of scalars) if (k in rule) body[k] = rule[k];
      const jsonCols = ["sqft_tiers_json", "property_type_adjustments_json", "service_type_multiplier_json", "service_type_fixed_surcharge_json", "intensity_multiplier_json", "urgency_rules_json", "recurring_discount_json"];
      for (const k of jsonCols) if (k in rule) body[k] = rule[k];
      const res = await authed(`/admin/pricing/rules/${id}`, { method: "PUT", body: JSON.stringify(body) });
      if (res.ok) { toast.success("Draft saved."); void load(); }
      else toast.error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Save failed.");
    } finally { setSaving(false); }
  }

  async function submitProposal() {
    if (!prop.title || !prop.reason || !prop.proposedEffectiveAt) return toast.error("Title, reason, and effective date are required.");
    const res = await authed("/admin/pricing/proposals", {
      method: "POST",
      body: JSON.stringify({
        pricingRuleId: id, title: prop.title, reason: prop.reason,
        externalNoticeSummary: prop.externalNoticeSummary || undefined,
        proposedEffectiveAt: new Date(prop.proposedEffectiveAt).toISOString(),
        affectsParties: prop.affectsParties,
      }),
    });
    if (res.ok) { toast.success("Submitted for approval. Super Admins notified."); setSubmitOpen(false); navigate("/pricing"); }
    else toast.error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not submit.");
  }

  function setJsonField(k: string, raw: string) {
    if (raw.trim() === "") { set(k, null); return; }
    try { set(k, JSON.parse(raw)); } catch { /* keep typing; validated on save */ set(k, raw); }
  }

  if (loading) return <DashboardShell title="Pricing rule"><div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></DashboardShell>;
  if (!rule) return <DashboardShell title="Not found"><Button variant="ghost" onClick={() => navigate("/pricing")}><ArrowLeft className="h-4 w-4" /> Back</Button></DashboardShell>;

  return (
    <DashboardShell
      title={rule.name}
      description={`Pricing rule • v${rule.version ?? 1}`}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant={rule.status === "active" ? "success" : rule.status === "draft" ? "warning" : "info"}>{String(rule.status).replace(/_/g, " ")}</Badge>
          <Button variant="ghost" onClick={() => navigate("/pricing")}><ArrowLeft className="h-4 w-4" /> Back</Button>
        </div>
      }
    >
      {!editable && <Card className="mb-4"><p className="text-sm text-slate-500">This rule is <strong>{String(rule.status)}</strong> and read-only. Clone it from the Pricing tab to make changes.</p></Card>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-charcoal dark:text-white">General</h3>
          <Input label="Name" value={String(rule.name ?? "")} onChange={(e) => set("name", e.target.value)} disabled={!editable} />
          <Input label="Description" value={String(rule.description ?? "")} onChange={(e) => set("description", e.target.value)} disabled={!editable} />
          <div className="grid grid-cols-3 gap-2">
            <Input label="City" value={String(rule.market_city ?? "")} onChange={(e) => set("market_city", e.target.value)} disabled={!editable} />
            <Input label="State" value={String(rule.market_state ?? "")} onChange={(e) => set("market_state", e.target.value)} disabled={!editable} />
            <Input label="ZIP" value={String(rule.market_zip ?? "")} onChange={(e) => set("market_zip", e.target.value)} disabled={!editable} />
          </div>
        </Card>

        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-charcoal dark:text-white">Base &amp; limits (cents)</h3>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Base fee" type="number" value={num("base_fee_cents")} onChange={(e) => set("base_fee_cents", Number(e.target.value))} disabled={!editable} />
            <Input label="Minimum booking" type="number" value={num("minimum_booking_price_cents")} onChange={(e) => set("minimum_booking_price_cents", Number(e.target.value))} disabled={!editable} />
            <Input label="Maximum (blank = none)" type="number" value={num("maximum_booking_price_cents")} onChange={(e) => set("maximum_booking_price_cents", e.target.value === "" ? null : Number(e.target.value))} disabled={!editable} />
            <Input label="Custom-quote above" type="number" value={num("requires_custom_quote_above_cents")} onChange={(e) => set("requires_custom_quote_above_cents", e.target.value === "" ? null : Number(e.target.value))} disabled={!editable} />
          </div>
        </Card>

        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-charcoal dark:text-white">Square footage</h3>
          <Select label="Enabled" options={BOOL} value={rule.sqft_pricing_enabled ? "yes" : "no"} onChange={(e) => set("sqft_pricing_enabled", e.target.value === "yes")} disabled={!editable} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Included sq ft" type="number" value={num("sqft_included_in_base")} onChange={(e) => set("sqft_included_in_base", Number(e.target.value))} disabled={!editable} />
            <Input label="Overage ¢/sq ft" type="number" value={num("sqft_overage_rate_cents_per_sqft")} onChange={(e) => set("sqft_overage_rate_cents_per_sqft", Number(e.target.value))} disabled={!editable} />
          </div>
          <Textarea label="Sq ft tiers JSON [{max,add_cents}]" value={json("sqft_tiers_json")} onChange={(e) => setJsonField("sqft_tiers_json", e.target.value)} disabled={!editable} />
        </Card>

        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-charcoal dark:text-white">Rooms (cents)</h3>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Bedrooms included" type="number" value={num("bedrooms_included_in_base")} onChange={(e) => set("bedrooms_included_in_base", Number(e.target.value))} disabled={!editable} />
            <Input label="Per extra bedroom" type="number" value={num("price_per_extra_bedroom_cents")} onChange={(e) => set("price_per_extra_bedroom_cents", Number(e.target.value))} disabled={!editable} />
            <Input label="Bathrooms included" type="number" value={num("bathrooms_included_in_base")} onChange={(e) => set("bathrooms_included_in_base", Number(e.target.value))} disabled={!editable} />
            <Input label="Per extra bathroom" type="number" value={num("price_per_extra_bathroom_cents")} onChange={(e) => set("price_per_extra_bathroom_cents", Number(e.target.value))} disabled={!editable} />
            <Input label="Per half bath" type="number" value={num("half_bathroom_price_cents")} onChange={(e) => set("half_bathroom_price_cents", Number(e.target.value))} disabled={!editable} />
          </div>
        </Card>

        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-charcoal dark:text-white">Pets &amp; distance</h3>
          <Select label="Pet pricing" options={BOOL} value={rule.pet_pricing_enabled ? "yes" : "no"} onChange={(e) => set("pet_pricing_enabled", e.target.value === "yes")} disabled={!editable} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Pet base ¢" type="number" value={num("pet_base_fee_cents")} onChange={(e) => set("pet_base_fee_cents", Number(e.target.value))} disabled={!editable} />
            <Input label="Per extra pet ¢" type="number" value={num("price_per_pet_cents")} onChange={(e) => set("price_per_pet_cents", Number(e.target.value))} disabled={!editable} />
          </div>
          <Select label="Distance pricing" options={BOOL} value={rule.distance_pricing_enabled ? "yes" : "no"} onChange={(e) => set("distance_pricing_enabled", e.target.value === "yes")} disabled={!editable} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Free miles" type="number" value={num("free_distance_miles")} onChange={(e) => set("free_distance_miles", Number(e.target.value))} disabled={!editable} />
            <Input label="¢ per mile" type="number" value={num("price_per_mile_cents")} onChange={(e) => set("price_per_mile_cents", Number(e.target.value))} disabled={!editable} />
          </div>
        </Card>

        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-charcoal dark:text-white">Multipliers (JSON)</h3>
          <Textarea label='Service type ×100 e.g. {"deep_cleaning":145}' value={json("service_type_multiplier_json")} onChange={(e) => setJsonField("service_type_multiplier_json", e.target.value)} disabled={!editable} />
          <Textarea label='Intensity ×100 e.g. {"heavy":125}' value={json("intensity_multiplier_json")} onChange={(e) => setJsonField("intensity_multiplier_json", e.target.value)} disabled={!editable} />
          <Textarea label='Urgency ×100 e.g. {"same_day":120}' value={json("urgency_rules_json")} onChange={(e) => setJsonField("urgency_rules_json", e.target.value)} disabled={!editable} />
          <Textarea label='Property type bps e.g. {"townhouse":500}' value={json("property_type_adjustments_json")} onChange={(e) => setJsonField("property_type_adjustments_json", e.target.value)} disabled={!editable} />
          <Textarea label='Recurring discount bps e.g. {"weekly_bps":1500}' value={json("recurring_discount_json")} onChange={(e) => setJsonField("recurring_discount_json", e.target.value)} disabled={!editable} />
          <Select label="Recurring discount" options={BOOL} value={rule.recurring_discount_enabled ? "yes" : "no"} onChange={(e) => set("recurring_discount_enabled", e.target.value === "yes")} disabled={!editable} />
          <Select label="Urgency pricing" options={BOOL} value={rule.urgency_pricing_enabled ? "yes" : "no"} onChange={(e) => set("urgency_pricing_enabled", e.target.value === "yes")} disabled={!editable} />
        </Card>

        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-charcoal dark:text-white">Rounding</h3>
          <Select label="Enabled" options={BOOL} value={rule.rounding_enabled ? "yes" : "no"} onChange={(e) => set("rounding_enabled", e.target.value === "yes")} disabled={!editable} />
          <Select label="Strategy" options={["end_in_9", "end_in_99", "nearest_increment", "round_up", "round_down", "custom"].map((v) => ({ value: v, label: v.replace(/_/g, " ") }))} value={String(rule.rounding_strategy ?? "end_in_9")} onChange={(e) => set("rounding_strategy", e.target.value)} disabled={!editable} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Increment ¢" type="number" value={num("rounding_increment_cents")} onChange={(e) => set("rounding_increment_cents", Number(e.target.value))} disabled={!editable} />
            <Input label="Ending ¢" type="number" value={num("rounding_ending_cents")} onChange={(e) => set("rounding_ending_cents", Number(e.target.value))} disabled={!editable} />
          </div>
        </Card>
      </div>

      {editable && (
        <div className="mt-6 flex gap-2">
          <Button onClick={save} loading={saving}><Save className="h-4 w-4" /> Save draft</Button>
          <Button variant="secondary" onClick={() => setSubmitOpen(true)}><Send className="h-4 w-4" /> Submit for approval</Button>
        </div>
      )}

      <Modal
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title="Submit pricing change for approval"
        description="Requires you + one other Super Admin, a 48-hour cooldown, and (if customer/cleaner-affecting) 14-day notice before taking effect."
        footer={<><Button variant="ghost" onClick={() => setSubmitOpen(false)}>Cancel</Button><Button onClick={submitProposal}>Submit</Button></>}
      >
        <div className="space-y-3">
          <Input label="Title" value={prop.title} onChange={(e) => setProp((p) => ({ ...p, title: e.target.value }))} />
          <Textarea label="Reason" value={prop.reason} onChange={(e) => setProp((p) => ({ ...p, reason: e.target.value }))} />
          <Textarea label="External notice summary (required if customer/cleaner-affecting)" value={prop.externalNoticeSummary} onChange={(e) => setProp((p) => ({ ...p, externalNoticeSummary: e.target.value }))} />
          <Select label="Affects customers or cleaners?" options={[{ value: "yes", label: "Yes — notice required" }, { value: "no", label: "No — internal only" }]} value={prop.affectsParties ? "yes" : "no"} onChange={(e) => setProp((p) => ({ ...p, affectsParties: e.target.value === "yes" }))} />
          <Input label="Proposed effective (≥ 48h out)" type="datetime-local" value={prop.proposedEffectiveAt} onChange={(e) => setProp((p) => ({ ...p, proposedEffectiveAt: e.target.value }))} />
        </div>
      </Modal>
    </DashboardShell>
  );
}
