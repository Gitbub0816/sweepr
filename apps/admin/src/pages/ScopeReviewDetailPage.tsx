/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { DashboardShell, Card, Badge, Button, Select, Textarea, Modal, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface AiResponse {
  admin_summary?: string;
  customer_facing_summary?: string;
  supporting_observations?: string[];
  missing_evidence?: string[];
  safety_flags?: Record<string, boolean>;
  scope_level_detected?: string;
  recommended_fee_code?: string;
}

interface RequestDetail {
  id: string;
  bookingId: string;
  bookingStatus: string;
  requestType: "additional_attention" | "refusal";
  status: string;
  selectedPackage: string | null;
  selectedCondition: string | null;
  cleanerNotes: string | null;
  refusalReason: string | null;
  aiConfidence: number | null;
  aiRecommendation: string | null;
  aiResponse: AiResponse | null;
  feeCode: string | null;
  feeAmountCents: number | null;
  adminDecision: string | null;
  createdAt: string;
  expiresAt: string | null;
  customerName: string | null;
  customerAccountStatus: string | null;
  cleanerName: string | null;
  address: string | null;
  photoUrls: string[];
}

interface LedgerPreview {
  currentTotalCents: number;
  proposedFeeCents: number;
  newTotalCents: number;
}

const STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "error" | "default"> = {
  pending_ai: "info", pending_admin: "warning", approved: "success",
  denied: "error", hard_denied: "error", expired: "default", cancelled: "default",
};

const SAFETY_FLAG_LABELS: Record<string, string> = {
  biohazard: "Biohazard",
  hoarding: "Hoarding indicators",
  hoarding_indicators: "Hoarding indicators",
  blocked_access: "Blocked access",
  animal_hazard: "Animal hazard",
  unsafe_environment: "Unsafe environment",
  damage_risk: "Damage risk",
};

const AAF_TIERS = [
  { value: "additional_attention_small", label: "Small" },
  { value: "additional_attention_medium", label: "Medium" },
  { value: "additional_attention_large", label: "Large" },
];

export function ScopeReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [req, setReq] = useState<RequestDetail | null>(null);
  const [ledger, setLedger] = useState<LedgerPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState("");
  const [feeCode, setFeeCode] = useState("additional_attention_small");
  const [feeCents, setFeeCents] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<"approve" | "deny" | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  }, [getToken]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await authed(`/scope-review/admin/requests/${id}`);
      if (res.ok) {
        const d = (await res.json()) as { request: RequestDetail; ledgerPreview: LedgerPreview };
        setReq(d.request);
        setLedger(d.ledgerPreview);
        if (d.request.aiResponse?.recommended_fee_code?.startsWith("additional_attention")) {
          setFeeCode(d.request.aiResponse.recommended_fee_code);
        } else if (d.request.feeCode?.startsWith("additional_attention")) {
          setFeeCode(d.request.feeCode);
        }
      }
      const settingsRes = await authed("/admin/settings/scope-review");
      if (settingsRes.ok) {
        const s = (await settingsRes.json()) as { settings: Record<string, string> };
        setFeeCents({
          additional_attention_small: Number(s.settings["scope_review.fee_additional_attention_small_cents"] ?? 2500),
          additional_attention_medium: Number(s.settings["scope_review.fee_additional_attention_medium_cents"] ?? 5000),
          additional_attention_large: Number(s.settings["scope_review.fee_additional_attention_large_cents"] ?? 10000),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [id, authed]);

  useEffect(() => { void load(); }, [load]);

  async function decide(decision: "approve" | "deny") {
    if (!id) return;
    setWorking(true);
    try {
      const body: Record<string, unknown> = { decision, note: note || undefined };
      if (decision === "approve" && req?.requestType === "additional_attention") body.feeCode = feeCode;
      const res = await authed(`/scope-review/admin/requests/${id}/decision`, { method: "POST", body: JSON.stringify(body) });
      if (res.ok) {
        toast.success(decision === "approve" ? "Approved." : "Denied.");
        setConfirmOpen(false);
        setNote("");
        void load();
      } else {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(e.error ?? "Action failed.");
      }
    } finally {
      setWorking(false);
    }
  }

  function openConfirm(decision: "approve" | "deny") {
    setPendingDecision(decision);
    setConfirmOpen(true);
  }

  if (loading) {
    return <DashboardShell title="Scope Review"><div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></DashboardShell>;
  }
  if (!req) {
    return (
      <DashboardShell title="Request not found">
        <Button variant="ghost" onClick={() => navigate("/scope-review")}><ArrowLeft className="h-4 w-4" /> Back</Button>
      </DashboardShell>
    );
  }

  const ai = req.aiResponse;
  const isOverride = req.status === "denied" || req.status === "hard_denied";
  const canDecide = req.status === "pending_admin" || isOverride;
  const activeFlags = ai?.safety_flags ? Object.entries(ai.safety_flags).filter(([, v]) => v) : [];

  return (
    <DashboardShell
      title={req.requestType === "refusal" ? "Service Refusal" : "Additional Attention Fee"}
      description={`Booking ${req.bookingId.slice(0, 8)} • ${req.customerName ?? "—"} / ${req.cleanerName ?? "—"}`}
      actions={<Button variant="ghost" onClick={() => navigate("/scope-review")}><ArrowLeft className="h-4 w-4" /> Back</Button>}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal dark:text-white">Overview</h3>
              <Badge variant={STATUS_VARIANT[req.status] ?? "default"}>{req.status.replace(/_/g, " ")}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Created" value={new Date(req.createdAt).toLocaleString()} />
              <Detail label="Expires" value={req.expiresAt ? new Date(req.expiresAt).toLocaleString() : "—"} />
              <Detail label="Customer" value={req.customerName ?? "—"} />
              <Detail label="Customer status" value={req.customerAccountStatus ?? "normal"} />
              <Detail label="Cleaner" value={req.cleanerName ?? "—"} />
              <Detail label="Address" value={req.address ?? "—"} />
              {req.refusalReason && <Detail label="Refusal reason" value={req.refusalReason.replace(/_/g, " ")} />}
              <Detail label="Cleaner notes" value={req.cleanerNotes ?? "—"} />
            </dl>
          </Card>

          {ai && (
            <Card className="space-y-3">
              <h3 className="font-semibold text-charcoal dark:text-white">AI assessment</h3>
              <div className="flex items-center gap-3">
                <ConfidenceMeter value={req.aiConfidence} />
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  Recommendation: <strong>{req.aiRecommendation?.replace(/_/g, " ") ?? "—"}</strong>
                </span>
              </div>
              {ai.scope_level_detected && (
                <p className="text-sm text-slate-500">Scope level detected: {ai.scope_level_detected.replace(/_/g, " ")}</p>
              )}
              {activeFlags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {activeFlags.map(([k]) => (
                    <span key={k} className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                      <AlertTriangle className="h-3 w-3" /> {SAFETY_FLAG_LABELS[k] ?? k.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
              {ai.admin_summary && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Admin summary</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{ai.admin_summary}</p>
                </div>
              )}
              {ai.customer_facing_summary && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Draft customer-facing summary</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{ai.customer_facing_summary}</p>
                </div>
              )}
              {ai.supporting_observations && ai.supporting_observations.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Supporting observations</h4>
                  <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
                    {ai.supporting_observations.map((o, i) => <li key={i}>{o}</li>)}
                  </ul>
                </div>
              )}
              {ai.missing_evidence && ai.missing_evidence.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Missing evidence</h4>
                  <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
                    {ai.missing_evidence.map((o, i) => <li key={i}>{o}</li>)}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {req.photoUrls.length > 0 && (
            <Card>
              <h3 className="mb-3 font-semibold text-charcoal dark:text-white">Photos</h3>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {req.photoUrls.map((url) => (
                  <button key={url} onClick={() => setLightbox(url)} className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    <img src={url} alt="Submitted evidence" className="h-28 w-full object-cover" />
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <h3 className="mb-3 font-semibold text-charcoal dark:text-white">Financial impact</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Current total</dt><dd className="font-medium">{formatCurrency((ledger?.currentTotalCents ?? 0) / 100)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{req.requestType === "refusal" ? "Refusal fee" : "Proposed fee"}</dt><dd className="font-medium">{formatCurrency((ledger?.proposedFeeCents ?? 0) / 100)}</dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 dark:border-slate-800"><dt className="text-slate-500">New total</dt><dd className="font-semibold">{formatCurrency((ledger?.newTotalCents ?? 0) / 100)}</dd></div>
            </dl>
          </Card>

          {canDecide && (
            <Card className="space-y-3">
              <h3 className="font-semibold text-charcoal dark:text-white">
                {isOverride ? "Override & approve" : "Decision"}
              </h3>
              {req.requestType === "additional_attention" && (
                <Select
                  label="Fee tier"
                  options={AAF_TIERS.map((t) => ({ value: t.value, label: `${t.label} — ${formatCurrency((feeCents[t.value] ?? 0) / 100)}` }))}
                  value={feeCode}
                  onChange={(e) => setFeeCode(e.target.value)}
                />
              )}
              <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button fullWidth onClick={() => openConfirm("approve")} loading={working}>
                {isOverride ? "Override & approve" : "Approve"}
              </Button>
              {!isOverride && (
                <Button fullWidth variant="danger" onClick={() => openConfirm("deny")} loading={working}>
                  Deny
                </Button>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={pendingDecision === "approve" ? "Confirm approval" : "Confirm denial"}
        description={
          pendingDecision === "approve" && req.requestType === "refusal"
            ? "This will cancel the booking, charge the customer the refusal fee, escalate their account status, and may add their address to the greylist."
            : pendingDecision === "approve"
              ? `This will charge the customer an additional ${formatCurrency((feeCents[feeCode] ?? 0) / 100)}, bringing the new total to ${formatCurrency((ledger?.newTotalCents ?? 0) / 100)}.`
              : "The cleaner will be notified that this request was denied."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              variant={pendingDecision === "deny" ? "danger" : "primary"}
              loading={working}
              onClick={() => pendingDecision && void decide(pendingDecision)}
            >
              Confirm
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-500">This action cannot be undone.</p>
      </Modal>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Submitted evidence full size" className="max-h-[90vh] max-w-[90vw] rounded-lg" />
        </div>
      )}
    </DashboardShell>
  );
}

function ConfidenceMeter({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  const pct = value <= 1 ? value * 100 : value;
  let color = "bg-red-500";
  if (pct >= 95) color = "bg-emerald-500";
  else if (pct >= 75) color = "bg-amber-500";
  else if (pct >= 50) color = "bg-orange-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <span className="text-sm font-medium">{pct.toFixed(0)}%</span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="font-medium text-charcoal dark:text-white">{value}</dd>
    </div>
  );
}
