/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * User Report investigation view — parties, booking summary, photo evidence
 * (streamed with auth from the PRIVATE report bucket), investigation notes,
 * status controls, and the resolve action (requires a resolution action and
 * a note; the reporter gets a neutral resolution email from the API).
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, ShieldQuestion } from "lucide-react";
import { DashboardShell, Card, Badge, Button, Select, Textarea, Modal, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import {
  REPORT_STATUS_VARIANT,
  REPORT_STATUS_LABEL,
  REPORT_CATEGORY_LABEL,
} from "./ReportsPage";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface ReportPhoto {
  id: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

interface ReportNote {
  id: string;
  author: string;
  note: string;
  createdAt: string;
}

interface ReportDetail {
  id: string;
  reference: string;
  bookingId: string;
  reporterRole: "customer" | "cleaner";
  category: string;
  status: string;
  description: string;
  resolutionAction: string | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reporter: { userId: string; name: string | null; email: string | null };
  reported: { userId: string; name: string | null; email: string | null };
  booking: {
    id: string;
    status: string;
    scheduledAt: string | null;
    serviceType: string | null;
    totalPrice: number | null;
    address: string | null;
  };
  photos: ReportPhoto[];
  notes: ReportNote[];
}

const RESOLUTION_ACTION_OPTIONS = [
  { value: "warning_issued", label: "Warning issued" },
  { value: "suspension", label: "Suspension" },
  { value: "other", label: "Other action" },
  { value: "none", label: "No action" },
];

const RESOLUTION_ACTION_LABEL: Record<string, string> = {
  none: "No action",
  warning_issued: "Warning issued",
  suspension: "Suspension",
  other: "Other action",
};

/** Fetches a private evidence photo with the admin token and renders a blob URL. */
function AuthPhoto({
  reportId,
  photoId,
  onOpen,
}: {
  reportId: string;
  photoId: string;
  onOpen: (url: string) => void;
}) {
  const { getToken } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/admin/reports/${reportId}/photos/${photoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [getToken, reportId, photoId]);

  if (failed) {
    return (
      <div className="flex h-28 w-full items-center justify-center rounded-lg border border-slate-200 text-xs text-slate-400 dark:border-slate-700">
        Unavailable
      </div>
    );
  }
  if (!url) {
    return <div className="h-28 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />;
  }
  return (
    <button onClick={() => onOpen(url)} className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <img src={url} alt="Report evidence" className="h-28 w-full object-cover" />
    </button>
  );
}

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [outcome, setOutcome] = useState<"action_taken" | "dismissed">("action_taken");
  const [resolutionAction, setResolutionAction] = useState("warning_issued");
  const [resolutionNote, setResolutionNote] = useState("");

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
      const res = await authed(`/admin/reports/${id}`);
      if (res.ok) setReport(((await res.json()) as { report: ReportDetail }).report);
    } finally {
      setLoading(false);
    }
  }, [id, authed]);

  useEffect(() => { void load(); }, [load]);

  async function changeStatus(status: "under_review") {
    if (!id) return;
    setWorking(true);
    try {
      const res = await authed(`/admin/reports/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success("Review started.");
        void load();
      } else {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(e.error ?? "Action failed.");
      }
    } finally {
      setWorking(false);
    }
  }

  async function addNote() {
    if (!id || !noteDraft.trim()) return;
    setWorking(true);
    try {
      const res = await authed(`/admin/reports/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({ note: noteDraft.trim() }),
      });
      if (res.ok) {
        setNoteDraft("");
        void load();
      } else {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(e.error ?? "Could not add the note.");
      }
    } finally {
      setWorking(false);
    }
  }

  async function resolve() {
    if (!id) return;
    if (resolutionNote.trim().length < 5) {
      toast.error("A resolution note is required.");
      return;
    }
    setWorking(true);
    try {
      const res = await authed(`/admin/reports/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({
          outcome,
          resolutionAction,
          resolutionNote: resolutionNote.trim(),
        }),
      });
      if (res.ok) {
        toast.success(outcome === "action_taken" ? "Resolved: action taken." : "Resolved: dismissed.");
        setResolveOpen(false);
        setResolutionNote("");
        void load();
      } else {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(e.error ?? "Action failed.");
      }
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell title="User Report">
        <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </DashboardShell>
    );
  }
  if (!report) {
    return (
      <DashboardShell title="Report not found">
        <Button variant="ghost" onClick={() => navigate("/reports")}><ArrowLeft className="h-4 w-4" /> Back</Button>
      </DashboardShell>
    );
  }

  const isOpen = report.status === "submitted" || report.status === "under_review";

  return (
    <DashboardShell
      title={`Report ${report.reference}`}
      description={`${REPORT_CATEGORY_LABEL[report.category] ?? report.category} · filed by the ${report.reporterRole}`}
      actions={<Button variant="ghost" onClick={() => navigate("/reports")}><ArrowLeft className="h-4 w-4" /> Back</Button>}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal dark:text-white">Overview</h3>
              <Badge variant={REPORT_STATUS_VARIANT[report.status] ?? "default"}>
                {REPORT_STATUS_LABEL[report.status] ?? report.status.replace(/_/g, " ")}
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Filed" value={new Date(report.createdAt).toLocaleString()} />
              <Detail label="Category" value={REPORT_CATEGORY_LABEL[report.category] ?? report.category} />
              <Detail
                label={`Reporter (${report.reporterRole})`}
                value={`${report.reporter.name ?? "Unknown"}${report.reporter.email ? ` · ${report.reporter.email}` : ""}`}
              />
              <Detail
                label={`Reported (${report.reporterRole === "customer" ? "cleaner" : "customer"})`}
                value={`${report.reported.name ?? "Unknown"}${report.reported.email ? ` · ${report.reported.email}` : ""}`}
              />
            </dl>
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase text-slate-500">Reporter's description</h4>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{report.description}</p>
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold text-charcoal dark:text-white">Booking</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Detail
                label="Booking"
                value={
                  <Link to={`/jobs/${report.booking.id}`} className="font-mono text-xs text-seafoam-700 underline dark:text-seafoam-300">
                    {report.booking.id.slice(0, 8)}
                  </Link>
                }
              />
              <Detail label="Status" value={report.booking.status.replace(/_/g, " ")} />
              <Detail
                label="Scheduled"
                value={report.booking.scheduledAt ? new Date(report.booking.scheduledAt).toLocaleString() : "Unknown"}
              />
              <Detail
                label="Total"
                value={report.booking.totalPrice != null ? formatCurrency(report.booking.totalPrice / 100) : "Unknown"}
              />
              <Detail label="Service" value={report.booking.serviceType?.replace(/_/g, " ") ?? "Unknown"} />
              <Detail label="Address" value={report.booking.address ?? "Unknown"} />
            </dl>
          </Card>

          {report.photos.length > 0 && (
            <Card>
              <h3 className="mb-3 font-semibold text-charcoal dark:text-white">
                Photo evidence ({report.photos.length})
              </h3>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {report.photos.map((p) => (
                  <AuthPhoto key={p.id} reportId={report.id} photoId={p.id} onOpen={setLightbox} />
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Evidence is stored privately and streamed only to admins.
              </p>
            </Card>
          )}

          <Card className="space-y-3">
            <h3 className="font-semibold text-charcoal dark:text-white">Investigation notes</h3>
            {report.notes.length === 0 ? (
              <p className="text-sm text-slate-500">No notes yet.</p>
            ) : (
              <ol className="space-y-2">
                {report.notes.map((n) => (
                  <li key={n.id} className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
                    <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{n.note}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {n.author} · {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            <div className="space-y-2">
              <Textarea
                label="Add a note"
                placeholder="Record findings, outreach, and decisions. Notes are internal and never shown to either party."
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <div className="flex justify-end">
                <Button variant="secondary" onClick={addNote} disabled={!noteDraft.trim()} loading={working}>
                  Add note
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-3">
            <h3 className="font-semibold text-charcoal dark:text-white">Status</h3>
            {report.status === "submitted" && (
              <>
                <p className="text-sm text-slate-500">New report. Start the review to begin the investigation.</p>
                <Button fullWidth onClick={() => void changeStatus("under_review")} loading={working}>
                  Start review
                </Button>
              </>
            )}
            {report.status === "under_review" && (
              <>
                <p className="text-sm text-slate-500">
                  Under investigation. Resolving requires a resolution action and a note; the
                  reporter receives a neutral resolution email.
                </p>
                <Button
                  fullWidth
                  onClick={() => { setOutcome("action_taken"); setResolutionAction("warning_issued"); setResolveOpen(true); }}
                  loading={working}
                >
                  Resolve: take action
                </Button>
                <Button
                  fullWidth
                  variant="secondary"
                  onClick={() => { setOutcome("dismissed"); setResolutionAction("none"); setResolveOpen(true); }}
                  loading={working}
                >
                  Resolve: dismiss
                </Button>
              </>
            )}
            {report.status === "dismissed" && (
              <>
                <p className="text-sm text-slate-500">Dismissed. Reopen if new information surfaces.</p>
                <Button fullWidth variant="secondary" onClick={() => void changeStatus("under_review")} loading={working}>
                  Reopen review
                </Button>
              </>
            )}
            {report.status === "action_taken" && (
              <p className="text-sm text-slate-500">Closed with action taken. This state is final.</p>
            )}
          </Card>

          {!isOpen && (
            <Card className="space-y-2">
              <h3 className="font-semibold text-charcoal dark:text-white">Resolution</h3>
              <dl className="space-y-2 text-sm">
                <Detail
                  label="Action"
                  value={report.resolutionAction ? (RESOLUTION_ACTION_LABEL[report.resolutionAction] ?? report.resolutionAction) : "Unknown"}
                />
                <Detail label="Note" value={report.resolutionNote ?? "Unknown"} />
                <Detail
                  label="Resolved"
                  value={report.resolvedAt ? new Date(report.resolvedAt).toLocaleString() : "Unknown"}
                />
              </dl>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        title={outcome === "action_taken" ? "Resolve: take action" : "Resolve: dismiss"}
        description={
          outcome === "action_taken"
            ? "Closes the investigation as action taken. The reporter is emailed that appropriate action was taken; details of the action are never shared with them."
            : "Closes the investigation without action. The reporter is emailed that the review is complete. A dismissed report can be reopened later."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolveOpen(false)} disabled={working}>Cancel</Button>
            <Button onClick={() => void resolve()} loading={working} disabled={resolutionNote.trim().length < 5}>
              Confirm resolution
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            label="Resolution action"
            options={RESOLUTION_ACTION_OPTIONS}
            value={resolutionAction}
            onChange={(e) => setResolutionAction(e.target.value)}
          />
          <Textarea
            label="Resolution note (required)"
            placeholder="What was found and why this resolution was chosen. Internal only."
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
          />
          <p className="flex items-start gap-1.5 text-xs text-slate-500">
            <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Account-level enforcement (suspensions, removals) is applied from the Customers or
            Cleaners screens; record here what was done.
          </p>
        </div>
      </Modal>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Report evidence full size" className="max-h-[90vh] max-w-[90vw] rounded-lg" />
        </div>
      )}
    </DashboardShell>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="font-medium text-charcoal dark:text-white">{value}</dd>
    </div>
  );
}
