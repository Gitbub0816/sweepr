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
import { useParams, useNavigate } from "react-router";
import { useAuth } from "@clerk/clerk-react";
import {
  ArrowLeft,
  ShieldCheck,
  IdCard,
  User as UserIcon,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  DashboardShell,
  Card,
  Badge,
  Button,
  Textarea,
  Modal,
  toast,
} from "@sweepr/ui";
import { SERVICE_LABELS, formatDateTime } from "@sweepr/utils";
import type { ServiceType } from "@sweepr/types";

const API_URL = import.meta.env.VITE_API_URL ?? "";

// Human vocabulary for Yardstik's raw enums. "consider" is NOT a denial — it
// means a human must review the report — so it renders amber, never red. Red
// is reserved for actual adverse-action states (FCRA presentation rule).
const YARDSTIK_LABEL: Record<string, string> = {
  clear: "Cleared",
  consider: "Needs review",
  submitted: "In progress",
  pending: "Pending",
  not_started: "Not started",
  pre_adverse_action: "Pre-adverse notice sent",
  adverse_action: "Adverse action",
  suspended: "Suspended",
};
const yardstikVariant: Record<string, "success" | "warning" | "info" | "error"> = {
  clear: "success",
  consider: "warning",
  submitted: "info",
  pending: "warning",
  not_started: "warning",
  pre_adverse_action: "error",
  adverse_action: "error",
};
const diditVariant: Record<string, "success" | "info" | "warning"> = {
  verified: "success",
  submitted: "info",
  pending: "warning",
  not_started: "warning",
};
const kybVariant: Record<string, "success" | "warning" | "error"> = {
  verified: "success",
  pending: "warning",
  not_started: "warning",
  failed: "error",
};

interface Application {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  bio: string | null;
  avatar_url: string | null;
  status: string;
  city: string | null;
  state: string | null;
  max_distance_miles: number | null;
  preferred_service_types: string[] | null;
  yardstik_status: string | null;
  yardstik_report_id?: string | null;
  yardstik_pre_adverse_at?: string | null;
  didit_status: string | null;
  created_at: string;
  account_type: string | null;
  business_name: string | null;
  business_type: string | null;
  state_of_incorporation: string | null;
  kyb_status: string | null;
  authorized_rep_name: string | null;
  authorized_rep_title: string | null;
}

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/admin/applications/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setApp(((await res.json()) as { application: Application }).application);
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  useEffect(() => { void load(); }, [load]);

  async function act(kind: "approve" | "reject") {
    if (!app) return;
    setWorking(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/admin/applications/${app.id}/${kind}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(kind === "reject" ? { reason } : {}),
      });
      if (!res.ok) throw new Error("failed");
      toast.success(
        kind === "approve" ? "Application approved." : "Application rejected."
      );
      navigate("/applications");
    } catch {
      toast.error("Action failed. Try again.");
    } finally {
      setWorking(false);
      setRejectOpen(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell title="Application">
        <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </DashboardShell>
    );
  }

  if (!app) {
    return (
      <DashboardShell title="Application not found">
        <Button variant="ghost" onClick={() => navigate("/applications")} aria-label="Back to applications">
          <ArrowLeft className="h-4 w-4" /> Back to applications
        </Button>
      </DashboardShell>
    );
  }

  const name = [app.first_name, app.last_name].filter(Boolean).join(" ") || app.business_name || "Applicant";
  const basedIn = [app.city, app.state].filter(Boolean).join(", ") || "Not provided";
  const services = (app.preferred_service_types ?? []) as ServiceType[];
  const isBusiness = app.account_type === "business";

  return (
    <DashboardShell
      title={name}
      description={`Application submitted ${formatDateTime(app.created_at)}`}
      actions={
        <Button variant="ghost" onClick={() => navigate("/applications")} aria-label="Back to applications">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="flex items-center gap-4">
              {app.avatar_url ? (
                <img
                  src={app.avatar_url}
                  alt={name}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800">
                  <UserIcon className="h-7 w-7" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold text-charcoal dark:text-white">
                    {name}
                  </p>
                  {isBusiness && <Badge variant="info">Business Account</Badge>}
                </div>
                {app.email && <p className="text-sm text-slate-500">{app.email}</p>}
                {app.phone && <p className="text-sm text-slate-500">{app.phone}</p>}
              </div>
            </div>
            {app.bio && (
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                {app.bio}
              </p>
            )}
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold text-charcoal dark:text-white">Service area</h3>
            <dl className="space-y-2 text-sm">
              <Row label="Location" value={basedIn} />
              <Row
                label="Travel radius"
                value={app.max_distance_miles ? `${app.max_distance_miles} miles` : null}
              />
            </dl>
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                Preferred services
              </p>
              {services.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {services.map((s) => (
                    <Badge key={s} variant="info">
                      {SERVICE_LABELS[s] ?? s}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600">No services selected.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {isBusiness && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-charcoal dark:text-white">
                  Business
                </h3>
                {app.kyb_status && (
                  <Badge variant={kybVariant[app.kyb_status] ?? "warning"}>
                    KYB: {app.kyb_status}
                  </Badge>
                )}
              </div>
              <dl className="space-y-2 text-sm">
                <Row label="Name" value={app.business_name} />
                <Row label="Type" value={app.business_type} />
                <Row label="State of incorporation" value={app.state_of_incorporation} />
                {app.authorized_rep_name && (
                  <Row
                    label="Authorized rep"
                    value={`${app.authorized_rep_name}${app.authorized_rep_title ? ` (${app.authorized_rep_title})` : ""}`}
                  />
                )}
              </dl>
            </Card>
          )}
          <Card>
            <h3 className="mb-3 font-semibold text-charcoal dark:text-white">
              Verification
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-500">
                  <ShieldCheck className="h-4 w-4" /> Background check
                </span>
                <Badge variant={yardstikVariant[app.yardstik_status ?? "not_started"] ?? "warning"}>
                  {YARDSTIK_LABEL[app.yardstik_status ?? "not_started"] ?? app.yardstik_status}
                </Badge>
              </div>
              <YardstikReportPanel
                applicationId={app.id}
                status={app.yardstik_status}
                hasReport={Boolean(app.yardstik_report_id)}
                getToken={getToken}
              />
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <span className="flex items-center gap-2 text-slate-500">
                  <IdCard className="h-4 w-4" /> Identity (Didit)
                </span>
                <Badge variant={diditVariant[app.didit_status ?? "not_started"] ?? "warning"}>
                  {(app.didit_status ?? "not_started").replace(/_/g, " ")}
                </Badge>
              </div>
            </div>
          </Card>

          {app.yardstik_status === "consider" && (
            <AdjudicationCard applicationId={app.id} getToken={getToken} onDone={load} />
          )}

          <Card className="space-y-3">
            <h3 className="font-semibold text-charcoal dark:text-white">Actions</h3>
            <Button fullWidth onClick={() => act("approve")} loading={working}>
              Approve
            </Button>
            <Button
              fullWidth
              variant="danger"
              onClick={() => setRejectOpen(true)}
            >
              Reject
            </Button>
          </Card>
        </div>
      </div>

      <Modal
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject application"
        description="The applicant will be emailed with the reason below."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => act("reject")} loading={working}>
              Confirm rejection
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why this application is being rejected."
        />
      </Modal>
    </DashboardShell>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right font-medium text-charcoal dark:text-white">
        {value || <span className="font-normal text-slate-400">Not provided</span>}
      </dd>
    </div>
  );
}

// ─── Yardstik report detail ───────────────────────────────────────────────────

interface ScreeningRecord {
  court?: string;
  offense?: string;
  charge?: string;
  disposition?: string;
  severity?: string;
  date?: string;
  [key: string]: unknown;
}
interface Screening {
  type?: string;
  name?: string;
  status?: string;
  result?: string;
  records?: ScreeningRecord[];
  [key: string]: unknown;
}
interface YardstikRawReport {
  id?: string;
  status?: string;
  result?: string;
  package_name?: string;
  created_at?: string;
  completed_at?: string | null;
  screenings?: Screening[];
  [key: string]: unknown;
}

function screeningTone(result?: string): "success" | "warning" | "error" | "info" {
  if (!result) return "info";
  if (result === "clear" || result === "pass") return "success";
  if (result === "consider" || result === "review") return "warning";
  if (result === "fail" || result === "adverse") return "error";
  return "info";
}

/** Expandable, live-fetched view of the full Yardstik report — screenings and
 * any records — so reviewers see exactly what came back without leaving the
 * console. Fetched on expand, never cached beyond the page, never persisted. */
function YardstikReportPanel({
  applicationId,
  status,
  hasReport,
  getToken,
}: {
  applicationId: string;
  status: string | null;
  hasReport: boolean;
  getToken: () => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<YardstikRawReport | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  // Nothing to show before a report exists.
  if (!hasReport && (!status || status === "not_started")) return null;

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/admin/applications/${applicationId}/yardstik-report`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => null)) as
        | { report?: YardstikRawReport; error?: string }
        | null;
      if (!res.ok || !body?.report) {
        throw new Error(body?.error ?? "Couldn't load the report.");
      }
      setReport(body.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the report.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium text-charcoal transition-colors hover:bg-slate-50 dark:text-white dark:hover:bg-slate-800"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && !report && !loading) void loadReport();
        }}
        aria-expanded={open}
      >
        <span>View full report</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 py-3 dark:border-slate-800">
          {loading && (
            <p className="flex items-center gap-2 py-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Fetching from Yardstik…
            </p>
          )}
          {error && (
            <div className="space-y-2 py-1">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <Button size="sm" variant="secondary" onClick={() => void loadReport()}>
                Retry
              </Button>
            </div>
          )}
          {report && (
            <div className="space-y-3">
              <dl className="space-y-1.5 text-sm">
                <Row label="Result" value={YARDSTIK_LABEL[report.result ?? report.status ?? ""] ?? (report.result || report.status)} />
                <Row label="Package" value={report.package_name} />
                <Row label="Started" value={report.created_at ? formatDateTime(report.created_at) : null} />
                <Row label="Completed" value={report.completed_at ? formatDateTime(report.completed_at) : "Not yet"} />
              </dl>

              {Array.isArray(report.screenings) && report.screenings.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Screenings
                  </p>
                  {report.screenings.map((s, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm text-charcoal dark:text-white">
                          {screeningTone(s.result) === "success" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-seafoam-600" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          )}
                          {s.name ?? (s.type ?? "Screening").replace(/_/g, " ")}
                        </span>
                        <Badge variant={screeningTone(s.result)}>
                          {(s.result ?? s.status ?? "pending").replace(/_/g, " ")}
                        </Badge>
                      </div>
                      {Array.isArray(s.records) && s.records.length > 0 && (
                        <ul className="mt-2 space-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                          {s.records.map((r, j) => (
                            <li key={j} className="text-xs text-slate-600 dark:text-slate-300">
                              <span className="font-medium text-charcoal dark:text-white">
                                {r.offense ?? r.charge ?? "Record"}
                              </span>
                              {r.court ? ` · ${r.court}` : ""}
                              {r.disposition ? ` · ${r.disposition}` : ""}
                              {r.date ? ` · ${r.date}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-charcoal dark:hover:text-white"
                onClick={() => setShowRaw((v) => !v)}
              >
                {showRaw ? "Hide raw response" : "Show raw response"}
              </button>
              {showRaw && (
                <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  {JSON.stringify(report, null, 2)}
                </pre>
              )}
              <p className="text-[11px] text-slate-400">
                Fetched live from Yardstik. Report contents are never stored by Sweepr;
                each view is audited.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FCRA adjudication actions ────────────────────────────────────────────────

/** Shown only while the report is in "consider": the two decisions that are
 * actually available at that stage, wired to the /adjudicate endpoint (which
 * enforces the FCRA waiting period server-side). */
function AdjudicationCard({
  applicationId,
  getToken,
  onDone,
}: {
  applicationId: string;
  getToken: () => Promise<string | null>;
  onDone: () => void | Promise<void>;
}) {
  const [confirm, setConfirm] = useState<"engaged" | "pre_adverse_action" | null>(null);
  const [violation, setViolation] = useState("");
  const [working, setWorking] = useState(false);

  async function adjudicate(kind: "engaged" | "pre_adverse_action") {
    setWorking(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/admin/applications/${applicationId}/adjudicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          kind === "pre_adverse_action"
            ? { adjudication: kind, violationDescription: violation || undefined }
            : { adjudication: kind }
        ),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Adjudication failed.");
      }
      toast.success(
        kind === "engaged"
          ? "Report cleared. The applicant can proceed."
          : "Pre-adverse notice sent. Yardstik runs the waiting period."
      );
      setConfirm(null);
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Adjudication failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card className="space-y-3 border-amber-200 dark:border-amber-900/50">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h3 className="font-semibold text-charcoal dark:text-white">Report needs a decision</h3>
      </div>
      <p className="text-xs text-slate-500">
        The background check returned records for review. Clear the report if the
        records don't disqualify, or start the FCRA adverse-action process. See the
        Adjudication Policy before deciding.
      </p>
      <Button fullWidth variant="secondary" onClick={() => setConfirm("engaged")}>
        Clear report (proceed)
      </Button>
      <Button fullWidth variant="danger" onClick={() => setConfirm("pre_adverse_action")}>
        Issue pre-adverse notice
      </Button>

      <Modal
        open={confirm !== null}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm === "engaged" ? "Clear this report?" : "Issue pre-adverse notice?"}
        description={
          confirm === "engaged"
            ? "The report will be marked cleared and the applicant can continue onboarding."
            : "Yardstik will send the candidate the pre-adverse notice with a copy of the report and start the statutory waiting period. This is the first step of adverse action."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={confirm === "engaged" ? "primary" : "danger"}
              loading={working}
              onClick={() => confirm && adjudicate(confirm)}
            >
              {confirm === "engaged" ? "Clear report" : "Send notice"}
            </Button>
          </>
        }
      >
        {confirm === "pre_adverse_action" && (
          <Textarea
            label="Reason (included in the notice)"
            value={violation}
            onChange={(e) => setViolation(e.target.value)}
            placeholder="Describe the record(s) prompting adverse action review."
          />
        )}
      </Modal>
    </Card>
  );
}
