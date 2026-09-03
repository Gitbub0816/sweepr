/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useState, useRef } from "react";
import { ShieldCheck, ShieldAlert, Upload, Clock, ExternalLink } from "lucide-react";
import { useAppToken } from "@/lib/appToken";
import { DashboardShell, Card, Button, toast } from "@sweepr/ui";
import { cn } from "@sweepr/utils";
import { COVERDASH_QUOTE_URL } from "@/lib/partners";

const API = import.meta.env.VITE_API_URL ?? "";

/**
 * Sweepr does NOT provide insurance. A cleaner carries their own general
 * liability policy — optionally bought through the Coverdash affiliate link
 * below — and uploads the certificate here for review. `coverage_type` is
 * legacy: rows predating this may still say "sweepr_program", which no
 * longer counts as coverage anywhere (see apps/api/src/lib/cleanerRequirements.ts).
 */
interface InsuranceRecord {
  id: string;
  coverage_type: string;
  policy_status: string;
  policy_number?: string;
  insurer_name?: string;
  coverage_amount_usd?: number;
  policy_expires_at?: string;
  doc_uploaded_at?: string;
  review_notes?: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending_upload: "No document uploaded",
  pending_review: "Awaiting admin review",
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<string, string> = {
  pending_upload: "text-slate-500",
  pending_review: "text-amber-600",
  active: "text-emerald-600",
  expiring_soon: "text-orange-500",
  expired: "text-red-600",
  rejected: "text-red-600",
};

export function InsurancePage() {
  const { getToken } = useAppToken();
  const [record, setRecord] = useState<InsuranceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [policyForm, setPolicyForm] = useState({
    policyNumber: "",
    insurerName: "",
    coverageAmountUsd: "",
    policyExpiresAt: "",
  });

  async function authFetch(path: string, opts: RequestInit = {}) {
    const token = await getToken();
    return fetch(`${API}${path}`, {
      ...opts,
      headers: {
        ...(opts.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  async function load() {
    try {
      const res = await authFetch("/insurance/me");
      const data = (await res.json()) as { insurance: InsuranceRecord | null };
      setRecord(data.insurance);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function uploadPolicy(file: File) {
    if (!policyForm.insurerName.trim() || !policyForm.policyNumber.trim()) {
      toast.error("Please enter your insurer name and policy number.");
      return;
    }
    const coverage = Number(policyForm.coverageAmountUsd);
    if (!Number.isFinite(coverage) || coverage < 500000) {
      toast.error("We require at least $500,000 in general liability coverage.");
      return;
    }
    if (!policyForm.policyExpiresAt) {
      toast.error("Please enter your policy expiration date.");
      return;
    }
    setUploading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/insurance/upload-policy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...policyForm,
          coverageAmountUsd: policyForm.coverageAmountUsd ? Number(policyForm.coverageAmountUsd) : undefined,
          policyExpiresAt: policyForm.policyExpiresAt ? new Date(policyForm.policyExpiresAt).toISOString() : undefined,
          fileName: file.name,
          contentType: file.type || "application/pdf",
        }),
      });
      if (!res.ok) throw new Error();
      const { uploadUrl } = (await res.json()) as { uploadUrl: string };

      // Upload directly to R2
      await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      });

      toast.success("Policy document submitted for review");
      await load();
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadPolicy(file);
  }

  const isActive = record?.policy_status === "active";

  return (
    <DashboardShell
      title="Insurance"
      description="Sweepr requires every cleaner to carry their own liability insurance before accepting jobs."
    >
      {/* Status banner */}
      {!loading && (
        <Card className={cn("flex items-center gap-4 p-4", isActive ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
          {isActive
            ? <ShieldCheck className="h-8 w-8 text-emerald-500 shrink-0" />
            : <ShieldAlert className="h-8 w-8 text-amber-500 shrink-0" />}
          <div>
            <p className={cn("font-semibold", isActive ? "text-emerald-800" : "text-amber-800")}>
              {isActive ? "Coverage active, you're good to accept jobs." : "Coverage required before you can accept jobs."}
            </p>
            {record && (
              <p className="text-sm text-slate-600 mt-0.5">
                Your policy · {STATUS_LABELS[record.policy_status] ?? record.policy_status}
              </p>
            )}
            {record?.policy_status === "rejected" && record.review_notes && (
              <p className="text-sm text-red-700 mt-1">Rejection reason: {record.review_notes}</p>
            )}
            {record?.policy_expires_at && (
              <p className="text-sm text-slate-500 mt-0.5">
                Expires {new Date(record.policy_expires_at).toLocaleDateString()}
              </p>
            )}
          </div>
        </Card>
      )}

      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <Upload className="h-6 w-6 text-seafoam-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-charcoal">Your liability policy</h3>
            <p className="text-sm text-slate-500 mt-1">
              You carry your own general liability insurance as an independent
              business. Sweepr does not sell or provide coverage. Upload your
              certificate of insurance (COI) or declarations page here and our
              team will review it. We require at least $500,000 in general
              liability.
            </p>
          </div>
        </div>

        {/* Coverdash affiliate quote flow. Sweepr does not underwrite,
            resell, or administer this policy — the cleaner buys directly
            from Coverdash, and the COI upload below is still required. */}
        <div className="rounded-xl border border-seafoam-200 bg-seafoam-50 p-4 dark:border-seafoam-900/40 dark:bg-seafoam-900/20">
          <p className="font-semibold text-seafoam-800 dark:text-seafoam-200">
            Don't have a policy yet?
          </p>
          <p className="mt-1 text-sm text-seafoam-800/90 dark:text-seafoam-200/90">
            Coverdash is our insurance partner. You buy the policy from them
            directly, in your own business's name. Quotes take a few minutes
            and coverage can start the same day.
          </p>
          <a
            href={COVERDASH_QUOTE_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-seafoam-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-seafoam-700"
          >
            Get a quote through Coverdash
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <p className="mt-3 text-xs text-seafoam-800/80 dark:text-seafoam-200/80">
            Buying through Coverdash doesn't connect the policy to Sweepr
            automatically. Once it's issued, upload your COI below so our team
            can review and approve it.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Insurer name</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
              value={policyForm.insurerName}
              onChange={(e) => setPolicyForm((p) => ({ ...p, insurerName: e.target.value }))}
              placeholder="State Farm, Hiscox…"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Policy number</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
              value={policyForm.policyNumber}
              onChange={(e) => setPolicyForm((p) => ({ ...p, policyNumber: e.target.value }))}
              placeholder="ABC-123456"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Coverage amount ($)</label>
            <input
              type="number"
              min="500000"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
              value={policyForm.coverageAmountUsd}
              onChange={(e) => setPolicyForm((p) => ({ ...p, coverageAmountUsd: e.target.value }))}
              placeholder="1000000"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Policy expiry date</label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
              value={policyForm.policyExpiresAt}
              onChange={(e) => setPolicyForm((p) => ({ ...p, policyExpiresAt: e.target.value }))}
            />
          </div>
        </div>

        {record?.coverage_type === "personal_policy" && record.doc_uploaded_at && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
            <Clock className="h-4 w-4 text-slate-600 shrink-0" />
            <span>
              Document uploaded {new Date(record.doc_uploaded_at).toLocaleDateString()} ·{" "}
              <span className={cn("font-medium", STATUS_COLORS[record.policy_status])}>
                {STATUS_LABELS[record.policy_status] ?? record.policy_status}
              </span>
            </span>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          onClick={() => fileRef.current?.click()}
          loading={uploading}
          variant="secondary"
          fullWidth
        >
          {record?.coverage_type === "personal_policy" && record.doc_uploaded_at
            ? "Replace document"
            : "Upload COI or declarations page"}
        </Button>

        <p className="text-xs text-slate-600">
          Accepted formats: PDF, JPG, PNG, WEBP · Max 10 MB
        </p>
      </Card>
    </DashboardShell>
  );
}
