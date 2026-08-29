/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  DashboardShell,
  Card,
  StatusBadge,
  Badge,
  Select,
  Button,
  Modal,
  ErrorState,
  toast,
  FoundingMemberBadge,
} from "@sweepr/ui";
import {
  SERVICE_LABELS,
  JOB_STATUS_LABELS,
  formatCurrency,
  formatDateTime,
} from "@sweepr/utils";
import type { JobStatus, ServiceType } from "@sweepr/types";

const API_URL = import.meta.env.VITE_API_URL ?? "";

const statusOptions = (Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map(
  (s) => ({ label: JOB_STATUS_LABELS[s], value: s })
);

interface Job {
  id: string;
  status: string;
  service_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  scheduled_at: string | null;
  total_price: number | null;
  cleaner_id: string | null;
  customer_first: string | null;
  customer_last: string | null;
  customer_email: string | null;
  street: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

interface CleanerOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avg_rating: number | null;
  founding_member?: boolean;
  founding_member_id?: number | null;
}

// ── Crew API shapes (GET /bookings/:id/crew) ──────────────────────────────────

type CrewStatus =
  | "NEEDS_STAFFING"
  | "STAFFING"
  | "PARTIALLY_STAFFED"
  | "CONFIRMED"
  | "AT_RISK"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "STAFFING_FAILED";

type SeatStatus =
  | "CANDIDATE"
  | "INVITED"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED"
  | "REMOVED"
  | "NO_SHOW"
  | "COMPLETED";

interface CrewSeat {
  id: string;
  bookingId: string;
  cleanerId: string | null;
  role: "LEAD" | "MEMBER";
  seatIndex: number;
  status: SeatStatus;
  personMinutes: number | null;
  assignmentScore: number | null;
  earningsCents: number;
  offeredAt: string | null;
  expiresAt: string | null;
  respondedAt: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  vouchedByAssignmentId: string | null;
  stripeTransferId: string | null;
  crewAssignmentVersion: number;
  // Optional matching explainability (present when the API surfaces it).
  scoreBreakdown?: Record<string, number> | null;
}

interface CrewData {
  booking: {
    id: string;
    crewStatus: CrewStatus | null;
    requiredCrewSize: number | null;
    minCrewSize: number | null;
    targetCrewSize: number | null;
    crewAssignmentVersion: number | null;
    extraCleanerRequested: boolean;
  };
  seats: CrewSeat[];
}

const CREW_STATUS_TONE: Record<CrewStatus, "success" | "warning" | "error" | "info" | "default"> = {
  NEEDS_STAFFING: "warning",
  STAFFING: "info",
  PARTIALLY_STAFFED: "warning",
  CONFIRMED: "success",
  AT_RISK: "error",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  STAFFING_FAILED: "error",
};

const CREW_STATUS_LABEL: Record<CrewStatus, string> = {
  NEEDS_STAFFING: "Needs staffing",
  STAFFING: "Staffing",
  PARTIALLY_STAFFED: "Partially staffed",
  CONFIRMED: "Confirmed",
  AT_RISK: "At risk",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  STAFFING_FAILED: "Staffing failed",
};

const SEAT_STATUS_TONE: Record<SeatStatus, "success" | "warning" | "error" | "info" | "default"> = {
  CANDIDATE: "default",
  INVITED: "info",
  ACCEPTED: "success",
  DECLINED: "error",
  EXPIRED: "warning",
  CANCELLED: "error",
  REMOVED: "error",
  NO_SHOW: "error",
  COMPLETED: "success",
};

const SEAT_STATUS_LABEL: Record<SeatStatus, string> = {
  CANDIDATE: "Open seat",
  INVITED: "Invited",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  REMOVED: "Removed",
  NO_SHOW: "No-show",
  COMPLETED: "Completed",
};

/** A seat that currently holds a cleaner (or held one to completion). */
function isFilled(s: CrewSeat): boolean {
  return s.status === "ACCEPTED" || s.status === "COMPLETED";
}

/** Title-case a score_breakdown key like "past_interaction" → "Past interaction". */
function factorLabel(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function minutesLabel(m: number | null): string {
  if (m == null) return "—";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min} min`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

// ── "Why this cleaner?" explainability popover (spec §48) ─────────────────────

function WhyPopover({ seat, cleanerName }: { seat: CrewSeat; cleanerName: string }) {
  const [open, setOpen] = useState(false);
  const breakdown = seat.scoreBreakdown ?? null;
  const factors = breakdown
    ? Object.entries(breakdown).filter(([, v]) => typeof v === "number")
    : [];
  // Bars are scaled against the largest factor so the mix reads clearly.
  const maxVal = factors.reduce((m, [, v]) => Math.max(m, Math.abs(v)), 0) || 1;

  return (
    <div
      className="relative inline-block"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="text-xs font-medium text-seafoam-700 underline decoration-dotted underline-offset-2 hover:text-seafoam-800 dark:text-seafoam-400"
      >
        Why this cleaner?
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`Why ${cleanerName} was matched`}
          className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-charcoal"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-charcoal dark:text-white">Match signals</span>
            {seat.assignmentScore != null && (
              <Badge variant="info">{Math.round(seat.assignmentScore)} match</Badge>
            )}
          </div>
          {factors.length > 0 ? (
            <ul className="space-y-2">
              {factors.map(([k, v]) => (
                <li key={k}>
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>{factorLabel(k)}</span>
                    <span className="font-medium tabular-nums">{Math.round(v)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-seafoam-500"
                      style={{ width: `${Math.min(100, Math.max(0, (Math.abs(v) / maxVal) * 100))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              This seat was matched on the standard signals: availability, distance, reliability, and
              qualification. A detailed per-signal breakdown is not available for this seat.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Crew management section (spec §47 + §49) ──────────────────────────────────

interface PendingAction {
  kind: "recalculate" | "invite" | "change-lead" | "replace" | "remove";
  seat?: CrewSeat;
  title: string;
  body: string;
  impact?: string[];
  confirmLabel: string;
  danger?: boolean;
}

function CrewSection({
  crew,
  nameOf,
  onReload,
}: {
  crew: CrewData;
  nameOf: (id: string | null) => string;
  onReload: () => void;
}) {
  const { getToken } = useAuth();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const seats = crew.seats;
  const filled = seats.filter(isFilled);
  const openSeats = seats.filter((s) => s.status === "CANDIDATE" || s.status === "INVITED");
  const required = crew.booking.requiredCrewSize ?? seats.length ?? 1;
  const confirmedCount = filled.length;

  const totalPersonMinutes = useMemo(
    () => seats.reduce((sum, s) => sum + (s.personMinutes ?? 0), 0),
    [seats],
  );

  // Rough on-site estimate: total labor spread across the crew of a given size.
  const estElapsed = (size: number) =>
    totalPersonMinutes > 0 && size > 0 ? Math.ceil(totalPersonMinutes / size) : null;

  const status = crew.booking.crewStatus;
  const progressPct = required > 0 ? Math.min(100, Math.round((confirmedCount / required) * 100)) : 0;

  async function run(action: PendingAction) {
    setBusy(true);
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      let res: Response;
      switch (action.kind) {
        case "recalculate":
          res = await fetch(`${API_URL}/bookings/${crew.booking.id}/crew/recalculate`, { method: "POST", headers });
          break;
        case "invite":
          res = await fetch(`${API_URL}/crew/invite`, {
            method: "POST",
            headers,
            body: JSON.stringify({ bookingId: crew.booking.id }),
          });
          break;
        case "change-lead":
          res = await fetch(`${API_URL}/crew/change-lead`, {
            method: "POST",
            headers,
            body: JSON.stringify({ bookingId: crew.booking.id }),
          });
          break;
        case "replace":
          res = await fetch(`${API_URL}/crew/${action.seat!.id}/replace`, { method: "POST", headers });
          break;
        case "remove":
          res = await fetch(`${API_URL}/crew/${action.seat!.id}`, { method: "DELETE", headers });
          break;
      }
      if (!res.ok) throw new Error(String(res.status));
      toast.success("Crew updated.");
      setPending(null);
      onReload();
    } catch {
      toast.error("Could not update the crew.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-charcoal dark:text-white">Crew</h2>
        {status && <Badge variant={CREW_STATUS_TONE[status]}>{CREW_STATUS_LABEL[status]}</Badge>}
      </div>

      {/* Sizing + labor summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs text-slate-500">Crew size</p>
          <p className="mt-1 text-sm font-semibold text-charcoal dark:text-white">
            {confirmedCount} of {required} confirmed
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Min {crew.booking.minCrewSize ?? 1}
            {crew.booking.targetCrewSize ? ` · target ${crew.booking.targetCrewSize}` : ""}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs text-slate-500">Estimated labor</p>
          <p className="mt-1 text-sm font-semibold text-charcoal dark:text-white">
            {totalPersonMinutes > 0 ? minutesLabel(totalPersonMinutes) : "—"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">person-minutes</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs text-slate-500">On-site (approx)</p>
          <p className="mt-1 text-sm font-semibold text-charcoal dark:text-white">
            {estElapsed(required) != null ? minutesLabel(estElapsed(required)) : "—"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">at {required}-person crew</p>
        </div>
      </div>

      {/* Staffing progress */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span>Staffing progress</span>
          <span className="tabular-nums">{progressPct}%</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
          role="progressbar"
          aria-valuenow={confirmedCount}
          aria-valuemin={0}
          aria-valuemax={required}
          aria-label="Crew staffing progress"
        >
          <div className="h-full rounded-full bg-seafoam-500 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Roster */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-800">
              <th className="pb-2 pr-3 font-medium">Seat</th>
              <th className="pb-2 pr-3 font-medium">Cleaner</th>
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 pr-3 text-right font-medium">Match</th>
              <th className="pb-2 pr-3 text-right font-medium">Est. earnings</th>
              <th className="pb-2 font-medium" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {seats.map((seat) => {
              const filledSeat = isFilled(seat);
              const cleanerName = seat.cleanerId ? nameOf(seat.cleanerId) : "Open seat";
              return (
                <tr key={seat.id} className="border-b border-slate-50 align-top dark:border-slate-800/60">
                  <td className="py-2.5 pr-3">
                    <Badge variant={seat.role === "LEAD" ? "info" : "default"}>
                      {seat.role === "LEAD" ? "Lead" : "Helper"}
                    </Badge>
                    <span className="ml-1.5 text-xs text-slate-400">#{seat.seatIndex + 1}</span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-charcoal dark:text-white">{cleanerName}</div>
                    {filledSeat && seat.cleanerId && (
                      <WhyPopover seat={seat} cleanerName={cleanerName} />
                    )}
                    {seat.vouchedByAssignmentId && (
                      <div className="text-xs text-slate-400">Vouched in on-site</div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge variant={SEAT_STATUS_TONE[seat.status]}>{SEAT_STATUS_LABEL[seat.status]}</Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {seat.assignmentScore != null ? Math.round(seat.assignmentScore) : "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {seat.earningsCents ? formatCurrency(seat.earningsCents / 100) : "—"}
                  </td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {seat.role === "LEAD" && filledSeat && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setPending({
                              kind: "change-lead",
                              seat,
                              title: "Change the crew lead?",
                              body: `This releases ${cleanerName} from the lead seat and starts a fresh search for a new lead. The helpers already on the crew stay in place.`,
                              impact: [
                                "The booking's primary cleaner pointer re-opens until a new lead accepts.",
                                "Start time may slip while the new lead is found.",
                              ],
                              confirmLabel: "Change lead",
                              danger: true,
                            })
                          }
                        >
                          Change lead
                        </Button>
                      )}
                      {filledSeat && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setPending({
                              kind: "replace",
                              seat,
                              title: `Replace ${cleanerName}?`,
                              body: `This removes ${cleanerName} from the ${seat.role === "LEAD" ? "lead" : "helper"} seat and re-opens it for a replacement.`,
                              impact: [
                                "The seat re-opens and a new invitation wave begins.",
                                `${cleanerName}'s share of the payout pool reassigns to the replacement.`,
                                "Timing may slip while the seat is re-staffed.",
                              ],
                              confirmLabel: "Replace cleaner",
                              danger: true,
                            })
                          }
                        >
                          Replace
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setPending({
                            kind: "remove",
                            seat,
                            title: "Remove this seat?",
                            body: `This permanently removes the ${seat.role === "LEAD" ? "lead" : "helper"} seat${seat.cleanerId ? ` held by ${cleanerName}` : ""} from the crew.`,
                            impact: [
                              `Crew size drops to ${Math.max(0, confirmedCount - (filledSeat ? 1 : 0))} confirmed.`,
                              estElapsed(Math.max(1, required - 1)) != null
                                ? `Estimated on-site time rises to about ${minutesLabel(estElapsed(Math.max(1, required - 1)))}.`
                                : "Estimated on-site time rises for the remaining crew.",
                              "The payout pool re-splits across the remaining members.",
                            ],
                            confirmLabel: "Remove seat",
                            danger: true,
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Booking-level crew actions */}
      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        <Button
          size="sm"
          onClick={() =>
            setPending({
              kind: "invite",
              title: openSeats.length > 0 ? "Add a cleaner to open seats?" : "Send crew invitations?",
              body:
                openSeats.length > 0
                  ? `This invites the next wave of candidates to the ${openSeats.length} open seat${openSeats.length === 1 ? "" : "s"} on this crew.`
                  : "This kicks the staffing dispatcher to invite candidates to any seats that still need a cleaner.",
              confirmLabel: "Send invitations",
            })
          }
          disabled={busy}
        >
          Add cleaner
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setPending({
              kind: "recalculate",
              title: "Re-run crew matching?",
              body: "This recomputes the crew plan and staffing state for this booking, and starts staffing any seats that need it.",
              impact: [
                "Open seats may receive a fresh wave of invitations.",
                "Confirmed seats are not disturbed.",
              ],
              confirmLabel: "Re-run matching",
            })
          }
          disabled={busy}
        >
          Re-run matching
        </Button>
      </div>

      {/* Confirm + impact modal (spec §49) */}
      <Modal
        open={!!pending}
        onOpenChange={(o) => !o && !busy && setPending(null)}
        title={pending?.title}
        description={pending?.body}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={pending?.danger ? "secondary" : "primary"}
              loading={busy}
              onClick={() => pending && run(pending)}
            >
              {pending?.confirmLabel}
            </Button>
          </>
        }
      >
        {pending?.impact && pending.impact.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
            <p className="mb-1 font-medium">What this changes</p>
            <ul className="list-disc space-y-1 pl-4">
              {pending.impact.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function JobDetailPage() {
  const { id } = useParams();
  const { getToken } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [cleaners, setCleaners] = useState<CleanerOption[]>([]);
  const [crew, setCrew] = useState<CrewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<JobStatus>("draft");
  const [cleaner, setCleaner] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const token = await getToken();
      const auth = { Authorization: `Bearer ${token}` };
      const [jobRes, clRes, crewRes] = await Promise.all([
        fetch(`${API_URL}/admin/jobs/${id}`, { headers: auth }),
        fetch(`${API_URL}/admin/cleaners?status=approved`, { headers: auth }),
        fetch(`${API_URL}/bookings/${id}/crew`, { headers: auth }),
      ]);
      if (jobRes.ok) {
        const j = ((await jobRes.json()) as { job: Job }).job;
        setJob(j);
        setStatus((j.status as JobStatus) ?? "draft");
        setCleaner(j.cleaner_id ?? "");
      }
      if (clRes.ok) setCleaners(((await clRes.json()) as { cleaners: CleanerOption[] }).cleaners ?? []);
      if (crewRes.ok) setCrew((await crewRes.json()) as CrewData);
      else setCrew(null);
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  useEffect(() => { void load(); }, [load]);

  const nameOf = useCallback(
    (cleanerId: string | null): string => {
      if (!cleanerId) return "Open seat";
      const c = cleaners.find((x) => x.id === cleanerId);
      const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : "";
      return name || `Cleaner ${cleanerId.slice(0, 8)}`;
    },
    [cleaners],
  );

  // A booking is a crew when the API returns a crew_status or any seat rows.
  const isCrew = !!crew && (crew.booking.crewStatus != null || crew.seats.length > 0);

  async function save() {
    if (!job) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/admin/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, cleaner_id: cleaner || null }),
      });
      if (!res.ok) throw new Error("failed");
      toast.success("Job updated");
    } catch {
      toast.error("Could not update job.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell title="Job">
        <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </DashboardShell>
    );
  }

  if (!job) {
    return (
      <ErrorState
        title="Job not found"
        action={
          <Link to="/jobs">
            <Button variant="secondary">Back to jobs</Button>
          </Link>
        }
      />
    );
  }

  const customer = [job.customer_first, job.customer_last].filter(Boolean).join(" ") || job.customer_email || "—";

  return (
    <DashboardShell
      title={job.id.slice(0, 8) + "…"}
      description={job.service_type ? SERVICE_LABELS[job.service_type as ServiceType] ?? job.service_type : "Job"}
      actions={<StatusBadge status={status} />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-charcoal dark:text-white">
              Customer &amp; location
            </h2>
            <p className="text-sm text-slate-500">Customer: {customer}</p>
            {job.scheduled_at && (
              <p className="text-sm text-slate-500">Scheduled: {formatDateTime(job.scheduled_at)}</p>
            )}
            <p className="text-sm text-slate-500">
              {[job.street, job.unit, job.city, job.state, job.zip].filter(Boolean).join(", ") || "—"}
            </p>
            <p className="text-sm text-slate-500">
              {job.bedrooms ?? "—"} bd · {job.bathrooms ?? "—"} ba · {job.sqft ?? "—"} sqft
            </p>
            {job.total_price != null && (
              <p className="text-sm font-medium text-charcoal dark:text-white">
                Total: {formatCurrency(job.total_price / 100)}
              </p>
            )}
          </Card>

          {/* Crew management (only for crew bookings; solo stays exactly as before). */}
          {isCrew && crew && <CrewSection crew={crew} nameOf={nameOf} onReload={load} />}

          <Card className="space-y-4">
            <h2 className="text-sm font-semibold text-charcoal dark:text-white">
              Admin controls
            </h2>
            <Select
              label="Status override"
              options={statusOptions}
              value={status}
              onChange={(e) => setStatus(e.target.value as JobStatus)}
            />
            {/* Solo reassign — unchanged, and only shown for solo bookings. Crew
                bookings manage their lead through the Crew section above. */}
            {!isCrew && (
              <>
                {(() => {
                  const assigned = cleaners.find((c) => c.id === cleaner);
                  return assigned?.founding_member ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Assigned:</span>
                      <FoundingMemberBadge founderId={assigned.founding_member_id} showTooltip={false} />
                    </div>
                  ) : null;
                })()}
                <Select
                  label="Reassign cleaner"
                  placeholder="Unassigned"
                  options={cleaners.map((c) => ({
                    label: `${c.founding_member ? "🏅 " : ""}${[c.first_name, c.last_name].filter(Boolean).join(" ") || c.id.slice(0, 8)}${c.avg_rating ? ` (${c.avg_rating}★)` : ""}`,
                    value: c.id,
                  }))}
                  value={cleaner}
                  onChange={(e) => setCleaner(e.target.value)}
                />
              </>
            )}
            <Button onClick={save} loading={saving}>
              Save changes
            </Button>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
