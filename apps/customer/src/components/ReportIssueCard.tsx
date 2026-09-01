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
 * Formal "Report an issue" entry on the customer booking detail page.
 *
 * Booking-scoped by design: the report is filed against the cleaner assigned
 * to THIS booking, reviewed by Sweepr's Trust and Safety team. Shows any
 * reports already filed on the booking with their current status. Photo
 * evidence uploads to the private report store through the API (never a
 * public bucket).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Flag, X } from "lucide-react";
import { Card, Button, Badge, Modal, Select, Textarea, toast } from "@sweepr/ui";
import { useAppToken } from "@/lib/appToken";

const API = import.meta.env.VITE_API_URL ?? "";

const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const CATEGORY_OPTIONS = [
  { value: "safety_concern", label: "Safety concern" },
  { value: "property_damage", label: "Property damage" },
  { value: "theft", label: "Theft or missing item" },
  { value: "harassment", label: "Harassment or inappropriate behavior" },
  { value: "no_show", label: "Cleaner did not show up" },
  { value: "unprofessional_conduct", label: "Unprofessional conduct" },
  { value: "payment_dispute", label: "Payment concern" },
  { value: "other", label: "Something else" },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "success" | "warning" | "error" | "info" }> = {
  submitted: { label: "Submitted", variant: "info" },
  under_review: { label: "Under review", variant: "warning" },
  action_taken: { label: "Resolved", variant: "success" },
  dismissed: { label: "Closed", variant: "default" },
};

// Mirrors the server's reportable window (confirmed and later).
const REPORTABLE_STATUSES = new Set([
  "confirmed", "cleaner_on_the_way", "arrived", "in_progress",
  "completed_pending_review", "completed", "disputed", "refunded",
  "cancelled_by_customer", "cancelled_by_cleaner",
]);

interface MyReport {
  id: string;
  reference: string;
  category: string;
  status: string;
  createdAt: string;
  photoCount: number;
}

export function ReportIssueCard({
  bookingId,
  bookingStatus,
}: {
  bookingId: string;
  bookingStatus: string;
}) {
  const { getToken } = useAppToken();
  const [reports, setReports] = useState<MyReport[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/reports/mine?bookingId=${bookingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { reports: MyReport[] };
        setReports(data.reports);
      }
    } catch {
      /* leave the list empty; the entry point still renders */
    }
  }, [getToken, bookingId]);

  useEffect(() => {
    if (REPORTABLE_STATUSES.has(bookingStatus)) void load();
  }, [load, bookingStatus]);

  if (!REPORTABLE_STATUSES.has(bookingStatus)) return null;

  const hasOpenReport = reports.some((r) => r.status === "submitted" || r.status === "under_review");

  return (
    <>
      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-charcoal dark:text-white">
              <Flag className="h-4 w-4 text-slate-400" /> Report an issue
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              If something went wrong with this booking, you can file a formal report.
              Our Trust and Safety team reviews every report.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => setOpen(true)}
            disabled={hasOpenReport}
          >
            Report an issue
          </Button>
        </div>

        {hasOpenReport && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            You have an open report on this booking. We will email you when the review is complete.
          </p>
        )}

        {reports.length > 0 && (
          <div className="space-y-2">
            {reports.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-charcoal dark:text-white">
                    {CATEGORY_LABEL[r.category] ?? r.category.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Case {r.reference} · {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant={STATUS_BADGE[r.status]?.variant ?? "default"}>
                  {STATUS_BADGE[r.status]?.label ?? r.status.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {open && (
        <ReportIssueModal
          bookingId={bookingId}
          onClose={() => setOpen(false)}
          onSubmitted={() => {
            setOpen(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function ReportIssueModal({
  bookingId,
  onClose,
  onSubmitted,
}: {
  bookingId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { getToken } = useAppToken();
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<{ file: File; previewUrl: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ reference: string; photoWarning: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList) {
    const room = MAX_PHOTOS - files.length;
    const incoming = Array.from(list).slice(0, room).filter((f) => {
      if (f.size > MAX_PHOTO_BYTES) {
        toast.error(`${f.name} is larger than 10MB.`);
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...incoming.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }

  function removeFile(previewUrl: string) {
    setFiles((prev) => prev.filter((f) => f.previewUrl !== previewUrl));
    URL.revokeObjectURL(previewUrl);
  }

  const canSubmit = !!category && description.trim().length >= 10 && !submitting;

  async function submit() {
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId, category, description: description.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; reference?: string; error?: string };
      if (res.status === 409) {
        toast.error("You already have an open report for this booking.");
        onClose();
        return;
      }
      if (!res.ok || !body.id) {
        toast.error(body.error ?? "We could not submit your report. Please try again.");
        return;
      }

      // Attach photo evidence (best-effort per file, after the report exists).
      let photoWarning = false;
      for (const { file } of files) {
        try {
          const up = await fetch(`${API}/reports/${body.id}/photos`, {
            method: "POST",
            headers: { "Content-Type": file.type, Authorization: `Bearer ${token}` },
            body: file,
          });
          if (!up.ok) photoWarning = true;
        } catch {
          photoWarning = true;
        }
      }

      setResult({ reference: body.reference ?? "", photoWarning });
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Modal open onOpenChange={() => onSubmitted()} title="Report submitted">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-seafoam-600 text-white">
            <Check className="h-5 w-5" />
          </span>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Thank you. Your report was submitted as case {result.reference}. Our Trust and
            Safety team will review it, and we sent a confirmation to your email.
          </p>
          {result.photoWarning && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Some photos could not be uploaded. You can contact support to add them to your case.
            </p>
          )}
          <Button fullWidth onClick={onSubmitted}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Report an issue"
      description="Tell us what happened on this booking. Reports are reviewed by our Trust and Safety team and treated as confidential."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit} loading={submitting}>Submit report</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="What happened?"
          placeholder="Choose a category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={CATEGORY_OPTIONS}
        />

        <Textarea
          label="Describe what happened"
          placeholder="Include what happened, when, and anything else that would help our review. At least 10 characters."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          minLength={10}
        />

        <div>
          <p className="mb-1 text-sm font-medium text-charcoal dark:text-white">
            Photos <span className="font-normal text-slate-400">(optional, up to {MAX_PHOTOS})</span>
          </p>
          <div className="grid grid-cols-4 gap-2">
            {files.map((f) => (
              <div key={f.previewUrl} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                <img src={f.previewUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(f.previewUrl)}
                  aria-label="Remove photo"
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {files.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-seafoam-400 hover:text-seafoam-600 dark:border-slate-700"
                aria-label="Add photo"
              >
                <Camera className="h-5 w-5" />
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          What happens next: our Trust and Safety team reviews your report and any photos,
          and may contact you for more detail. You will get an email confirmation now and
          another when the review is complete. Reports are confidential and never shared
          with the other party as written.
        </div>
      </div>
    </Modal>
  );
}
