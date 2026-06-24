import { useEffect, useState, useRef } from "react";
import { Shield, ShieldCheck, ShieldAlert, Upload, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Button, toast } from "@sweepr/ui";
import { cn } from "@sweepr/utils";

const API = import.meta.env.VITE_API_URL ?? "";

interface InsuranceRecord {
  id: string;
  coverage_type: "sweepr_program" | "personal_policy";
  policy_status: string;
  policy_number?: string;
  insurer_name?: string;
  coverage_amount_usd?: number;
  policy_expires_at?: string;
  doc_uploaded_at?: string;
  review_notes?: string;
  program_active_since?: string;
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
  const { getToken } = useAuth();
  const [record, setRecord] = useState<InsuranceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<"sweepr" | "personal">("sweepr");
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

  async function enrollProgram() {
    setEnrolling(true);
    try {
      const res = await authFetch("/insurance/enroll-program", { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Enrolled in Sweepr Coverage Program");
      await load();
    } catch {
      toast.error("Could not enroll. Please try again.");
    } finally {
      setEnrolling(false);
    }
  }

  async function uploadPolicy(file: File) {
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

  const isActive =
    record?.coverage_type === "sweepr_program"
      ? !!record.program_active_since
      : record?.policy_status === "active";

  return (
    <DashboardShell
      title="Insurance"
      description="Sweepr requires all cleaners to carry coverage before accepting jobs."
    >
      {/* Status banner */}
      {!loading && (
        <Card className={cn("flex items-center gap-4 p-4", isActive ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
          {isActive
            ? <ShieldCheck className="h-8 w-8 text-emerald-500 shrink-0" />
            : <ShieldAlert className="h-8 w-8 text-amber-500 shrink-0" />}
          <div>
            <p className={cn("font-semibold", isActive ? "text-emerald-800" : "text-amber-800")}>
              {isActive ? "Coverage active — you're good to accept jobs." : "Coverage required before you can accept jobs."}
            </p>
            {record && (
              <p className="text-sm text-slate-600 mt-0.5">
                {record.coverage_type === "sweepr_program"
                  ? `Sweepr Coverage Program · active since ${new Date(record.program_active_since!).toLocaleDateString()}`
                  : `Personal policy · ${STATUS_LABELS[record.policy_status] ?? record.policy_status}`
                }
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

      {/* Option tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {(["sweepr", "personal"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === t
                ? "border-seafoam-500 text-seafoam-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {t === "sweepr" ? "Sweepr Coverage Program" : "My Own Policy"}
          </button>
        ))}
      </div>

      {tab === "sweepr" ? (
        <Card className="space-y-4">
          <div className="flex items-start gap-3">
            <Shield className="h-6 w-6 text-seafoam-500 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-charcoal">Sweepr Coverage Program</h3>
              <p className="text-sm text-slate-500 mt-1">
                $15/month added to your next payout deduction. Covers general liability up to $1M per
                occurrence while on Sweepr jobs. No paperwork, no renewals.
              </p>
            </div>
          </div>

          <ul className="space-y-2 text-sm text-slate-600 pl-2">
            {[
              "$1,000,000 general liability coverage",
              "Covers property damage during Sweepr jobs",
              "Included in your existing earnings flow — no separate payment",
              "Certificate of insurance available on request",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          {record?.coverage_type === "sweepr_program" && record.program_active_since ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 font-medium">
              You're enrolled. Coverage is active.
            </div>
          ) : (
            <Button onClick={enrollProgram} loading={enrolling} fullWidth>
              Enroll — $15/mo
            </Button>
          )}
        </Card>
      ) : (
        <Card className="space-y-4">
          <div className="flex items-start gap-3">
            <Upload className="h-6 w-6 text-seafoam-500 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-charcoal">Upload Your Own Policy</h3>
              <p className="text-sm text-slate-500 mt-1">
                Already covered? Upload your certificate of insurance or declarations page. We require
                at least $500,000 general liability.
              </p>
            </div>
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
              <Clock className="h-4 w-4 text-slate-400 shrink-0" />
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

          <p className="text-xs text-slate-400">
            Accepted formats: PDF, JPG, PNG, WEBP · Max 10 MB
          </p>
        </Card>
      )}
    </DashboardShell>
  );
}
