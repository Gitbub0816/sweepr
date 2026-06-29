import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, Send } from "lucide-react";
import { DashboardShell, Card, Button, Badge, Input, Select, Textarea, Modal, toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

type Rule = Record<string, unknown> & { id: string; status: string; name: string };

const BOOL = [{ value: "yes", label: "Enabled" }, { value: "no", label: "Disabled" }];

const SVC_TYPES = ["light", "standard", "deep", "move_in_out", "post_construction", "recurring", "vacation_rental"] as const;
const SVC_LABELS: Record<string, string> = {
  light: "Light", standard: "Standard", deep: "Deep", move_in_out: "Move In/Out",
  post_construction: "Post-Const.", recurring: "Recurring", vacation_rental: "Vac. Rental",
};
const PROP_TYPES = ["studio", "apartment", "condo", "townhouse", "house", "large_house"] as const;
const PROP_LABELS: Record<string, string> = {
  studio: "Studio", apartment: "Apartment", condo: "Condo",
  townhouse: "Townhouse", house: "House", large_house: "Large House",
};

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

  // ── config_json helpers ──────────────────────────────────────────────────────
  const cfg = rule?.config_json as Record<string, unknown> | undefined;

  function cfgNum(section: string, key: string): string {
    const sec = cfg?.[section] as Record<string, unknown> | undefined;
    const val = sec?.[key];
    return val == null ? "" : String(val);
  }
  function setCfgNum(section: string, key: string, raw: string) {
    setRule(r => {
      if (!r) return r;
      const prev = (r.config_json as Record<string, unknown>) ?? {};
      const prevSec = (prev[section] as Record<string, unknown>) ?? {};
      return { ...r, config_json: { ...prev, [section]: { ...prevSec, [key]: raw === "" ? null : Number(raw) } } };
    });
  }
  function cfgNested(section: string, sub: string, key: string): string {
    const sec = cfg?.[section] as Record<string, unknown> | undefined;
    const s = sec?.[sub] as Record<string, unknown> | undefined;
    const val = s?.[key];
    return val == null ? "" : String(val);
  }
  function setCfgNested(section: string, sub: string, key: string, raw: string) {
    setRule(r => {
      if (!r) return r;
      const prev = (r.config_json as Record<string, unknown>) ?? {};
      const prevSec = (prev[section] as Record<string, unknown>) ?? {};
      const prevSub = (prevSec[sub] as Record<string, unknown>) ?? {};
      return { ...r, config_json: { ...prev, [section]: { ...prevSec, [sub]: { ...prevSub, [key]: raw === "" ? null : Number(raw) } } } };
    });
  }

  // ── legacy JSON-column helpers ───────────────────────────────────────────────
  function legacyJsonNum(col: string, key: string): string {
    const obj = rule?.[col] as Record<string, unknown> | undefined;
    return obj?.[key] == null ? "" : String(obj[key]);
  }
  function setLegacyJsonNum(col: string, key: string, raw: string) {
    set(col, { ...(rule?.[col] as object ?? {}), [key]: raw === "" ? undefined : Number(raw) });
  }

  async function save() {
    if (!rule || !editable) return;
    setSaving(true);
    try {
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
      const jsonCols = ["sqft_tiers_json", "property_type_adjustments_json", "service_type_multiplier_json",
        "service_type_fixed_surcharge_json", "intensity_multiplier_json", "urgency_rules_json",
        "recurring_discount_json", "config_json"];
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

  if (loading) return <DashboardShell title="Pricing rule"><div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></DashboardShell>;
  if (!rule) return <DashboardShell title="Not found"><Button variant="ghost" onClick={() => navigate("/pricing")}><ArrowLeft className="h-4 w-4" /> Back</Button></DashboardShell>;

  const hasConfigJson = rule.config_json != null;
  const platform = (cfg?.platform ?? {}) as Record<string, unknown>;

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

        {/* ── General ─────────────────────────────────────────────────────── */}
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

        {/* ── SWEEPR engine: Platform ──────────────────────────────────────── */}
        {hasConfigJson && (
          <Card className="space-y-3">
            <h3 className="text-sm font-semibold text-charcoal dark:text-white">Platform / processing</h3>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Stripe % (e.g. 0.029)" type="number" step="0.001"
                value={cfgNum("platform", "stripePercent")}
                onChange={(e) => setCfgNum("platform", "stripePercent", e.target.value)}
                disabled={!editable} />
              <Input label="Stripe fixed (cents, e.g. 30)" type="number"
                value={cfgNum("platform", "stripeFixed")}
                onChange={(e) => setCfgNum("platform", "stripeFixed", e.target.value)}
                disabled={!editable} />
            </div>
            <Select label="Charm pricing (round to next X9)"
              options={BOOL}
              value={platform.roundToCharmPrice ? "yes" : "no"}
              onChange={(e) => {
                setRule(r => r ? {
                  ...r,
                  config_json: { ...(r.config_json as object), platform: { ...platform, roundToCharmPrice: e.target.value === "yes" } },
                } : r);
              }}
              disabled={!editable} />
          </Card>
        )}

        {/* ── SWEEPR engine: Base prices per service ───────────────────────── */}
        {hasConfigJson && (
          <Card className="space-y-3 lg:col-span-2">
            <h3 className="text-sm font-semibold text-charcoal dark:text-white">Base prices (cents)</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {SVC_TYPES.map(svc => (
                <Input key={svc} label={SVC_LABELS[svc]} type="number"
                  value={cfgNum("baseByServiceType", svc)}
                  onChange={(e) => setCfgNum("baseByServiceType", svc, e.target.value)}
                  disabled={!editable} />
              ))}
            </div>
          </Card>
        )}

        {/* ── SWEEPR engine: Sqft ──────────────────────────────────────────── */}
        {hasConfigJson && (
          <Card className="space-y-4 lg:col-span-2">
            <h3 className="text-sm font-semibold text-charcoal dark:text-white">Square footage</h3>
            <div>
              <p className="mb-2 text-xs text-slate-500">Free allowance per service type (sq ft)</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {SVC_TYPES.map(svc => (
                  <Input key={svc} label={SVC_LABELS[svc]} type="number"
                    value={cfgNested("sqftPricing", "includedSqft", svc)}
                    onChange={(e) => setCfgNested("sqftPricing", "includedSqft", svc, e.target.value)}
                    disabled={!editable} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-slate-500">Rate per extra sq ft (cents, decimals ok — e.g. 4.5 = $0.045)</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {SVC_TYPES.map(svc => (
                  <Input key={svc} label={SVC_LABELS[svc]} type="number" step="0.1"
                    value={cfgNested("sqftPricing", "pricePerExtraSqft", svc)}
                    onChange={(e) => setCfgNested("sqftPricing", "pricePerExtraSqft", svc, e.target.value)}
                    disabled={!editable} />
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* ── SWEEPR engine: Rooms ─────────────────────────────────────────── */}
        {hasConfigJson && (
          <Card className="space-y-4 lg:col-span-2">
            <h3 className="text-sm font-semibold text-charcoal dark:text-white">Room pricing (cents)</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Input label="Bedrooms included in base" type="number"
                value={cfgNum("roomPricing", "includedBedrooms")}
                onChange={(e) => setCfgNum("roomPricing", "includedBedrooms", e.target.value)}
                disabled={!editable} />
              <Input label="Bathrooms included in base" type="number"
                value={cfgNum("roomPricing", "includedBathrooms")}
                onChange={(e) => setCfgNum("roomPricing", "includedBathrooms", e.target.value)}
                disabled={!editable} />
            </div>
            <div>
              <p className="mb-2 text-xs text-slate-500">Per extra bedroom (cents)</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {SVC_TYPES.map(svc => (
                  <Input key={svc} label={SVC_LABELS[svc]} type="number"
                    value={cfgNested("roomPricing", "bedroom", svc)}
                    onChange={(e) => setCfgNested("roomPricing", "bedroom", svc, e.target.value)}
                    disabled={!editable} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-slate-500">Per extra bathroom (cents)</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {SVC_TYPES.map(svc => (
                  <Input key={svc} label={SVC_LABELS[svc]} type="number"
                    value={cfgNested("roomPricing", "bathroom", svc)}
                    onChange={(e) => setCfgNested("roomPricing", "bathroom", svc, e.target.value)}
                    disabled={!editable} />
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* ── SWEEPR engine: Property multipliers ─────────────────────────── */}
        {hasConfigJson && (
          <Card className="space-y-3">
            <h3 className="text-sm font-semibold text-charcoal dark:text-white">Property type multipliers</h3>
            <p className="text-xs text-slate-500">Decimal — 1.0 = no change, 1.1 = +10%</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PROP_TYPES.map(pt => (
                <Input key={pt} label={PROP_LABELS[pt]} type="number" step="0.01"
                  value={cfgNum("propertyTypeMultiplier", pt)}
                  onChange={(e) => setCfgNum("propertyTypeMultiplier", pt, e.target.value)}
                  disabled={!editable} />
              ))}
            </div>
          </Card>
        )}

        {/* ── SWEEPR engine: Condition multipliers ────────────────────────── */}
        {hasConfigJson && (
          <Card className="space-y-3">
            <h3 className="text-sm font-semibold text-charcoal dark:text-white">Condition multipliers</h3>
            <p className="text-xs text-slate-500">Decimal — 1.08 = +8% surcharge</p>
            <div className="grid grid-cols-2 gap-2">
              {([ ["pets", "Pets"], ["heavySoil", "Heavy Soil"], ["lotsOfClutter", "Lots of Clutter"], ["smokerHome", "Smoker Home"] ] as [string, string][]).map(([k, label]) => (
                <Input key={k} label={label} type="number" step="0.01"
                  value={cfgNum("conditionMultipliers", k)}
                  onChange={(e) => setCfgNum("conditionMultipliers", k, e.target.value)}
                  disabled={!editable} />
              ))}
            </div>
          </Card>
        )}

        {/* ── SWEEPR engine: Minimums ──────────────────────────────────────── */}
        {hasConfigJson && (
          <Card className="space-y-3">
            <h3 className="text-sm font-semibold text-charcoal dark:text-white">Minimums per service (cents)</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {SVC_TYPES.map(svc => (
                <Input key={svc} label={SVC_LABELS[svc]} type="number"
                  value={cfgNum("minimums", svc)}
                  onChange={(e) => setCfgNum("minimums", svc, e.target.value)}
                  disabled={!editable} />
              ))}
            </div>
          </Card>
        )}

        {/* ── SWEEPR engine: Cleaner payout ───────────────────────────────── */}
        {hasConfigJson && (
          <Card className="space-y-3">
            <h3 className="text-sm font-semibold text-charcoal dark:text-white">Cleaner payout</h3>
            <p className="text-xs text-slate-500">Decimal — 0.65 = cleaner keeps 65% of customer price</p>
            <Input label="Default %" type="number" step="0.01"
              value={cfgNum("cleanerPayout", "defaultPercent")}
              onChange={(e) => setCfgNum("cleanerPayout", "defaultPercent", e.target.value)}
              disabled={!editable} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {SVC_TYPES.map(svc => (
                <Input key={svc} label={SVC_LABELS[svc]} type="number" step="0.01"
                  value={cfgNested("cleanerPayout", "byServiceType", svc)}
                  onChange={(e) => setCfgNested("cleanerPayout", "byServiceType", svc, e.target.value)}
                  disabled={!editable} />
              ))}
            </div>
          </Card>
        )}

        {/* ── Legacy column-based rule fields (no config_json) ────────────── */}
        {!hasConfigJson && (
          <>
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
              <h3 className="text-sm font-semibold text-charcoal dark:text-white">Service type multipliers</h3>
              <p className="text-xs text-slate-500">×100 — 100 = 1.0×, 155 = 1.55×</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SVC_TYPES.map(svc => (
                  <Input key={svc} label={SVC_LABELS[svc]} type="number"
                    value={legacyJsonNum("service_type_multiplier_json", svc)}
                    onChange={(e) => setLegacyJsonNum("service_type_multiplier_json", svc, e.target.value)}
                    disabled={!editable} />
                ))}
              </div>
            </Card>

            <Card className="space-y-3">
              <h3 className="text-sm font-semibold text-charcoal dark:text-white">Property type adjustments</h3>
              <p className="text-xs text-slate-500">Basis points — 500 = +5%</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PROP_TYPES.map(pt => (
                  <Input key={pt} label={PROP_LABELS[pt]} type="number"
                    value={legacyJsonNum("property_type_adjustments_json", pt)}
                    onChange={(e) => setLegacyJsonNum("property_type_adjustments_json", pt, e.target.value)}
                    disabled={!editable} />
                ))}
              </div>
            </Card>

            <Card className="space-y-3">
              <h3 className="text-sm font-semibold text-charcoal dark:text-white">Intensity multipliers</h3>
              <p className="text-xs text-slate-500">×100 — 100 = 1.0×, 125 = 1.25×</p>
              <div className="grid grid-cols-2 gap-2">
                {(["light", "normal", "heavy", "extreme"] as const).map(lvl => (
                  <Input key={lvl} label={lvl.charAt(0).toUpperCase() + lvl.slice(1)} type="number"
                    value={legacyJsonNum("intensity_multiplier_json", lvl)}
                    onChange={(e) => setLegacyJsonNum("intensity_multiplier_json", lvl, e.target.value)}
                    disabled={!editable} />
                ))}
              </div>
            </Card>

            <Card className="space-y-3">
              <h3 className="text-sm font-semibold text-charcoal dark:text-white">Urgency multipliers</h3>
              <p className="text-xs text-slate-500">×100 — 100 = 1.0×, 120 = +20%</p>
              <Select label="Urgency pricing" options={BOOL} value={rule.urgency_pricing_enabled ? "yes" : "no"} onChange={(e) => set("urgency_pricing_enabled", e.target.value === "yes")} disabled={!editable} />
              <div className="grid grid-cols-2 gap-2">
                {(["same_day", "next_day", "peak", "low_supply"] as const).map(u => (
                  <Input key={u} label={u.replace(/_/g, " ")} type="number"
                    value={legacyJsonNum("urgency_rules_json", u)}
                    onChange={(e) => setLegacyJsonNum("urgency_rules_json", u, e.target.value)}
                    disabled={!editable} />
                ))}
              </div>
            </Card>

            <Card className="space-y-3">
              <h3 className="text-sm font-semibold text-charcoal dark:text-white">Recurring discounts</h3>
              <p className="text-xs text-slate-500">Basis points — 1000 = 10% off</p>
              <Select label="Recurring discount" options={BOOL} value={rule.recurring_discount_enabled ? "yes" : "no"} onChange={(e) => set("recurring_discount_enabled", e.target.value === "yes")} disabled={!editable} />
              <div className="grid grid-cols-3 gap-2">
                {([ ["weekly_bps", "Weekly"], ["biweekly_bps", "Biweekly"], ["monthly_bps", "Monthly"] ] as [string, string][]).map(([k, label]) => (
                  <Input key={k} label={label} type="number"
                    value={legacyJsonNum("recurring_discount_json", k)}
                    onChange={(e) => setLegacyJsonNum("recurring_discount_json", k, e.target.value)}
                    disabled={!editable} />
                ))}
              </div>
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
          </>
        )}

      </div>

      {editable && (
        <div className="mt-6 flex gap-2">
          <Button onClick={async () => { await save(); setSubmitOpen(true); }} loading={saving}>
            <Send className="h-4 w-4" /> Submit for approval
          </Button>
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
