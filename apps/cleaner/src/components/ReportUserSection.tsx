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
 * Formal "Report an issue" entry on the cleaner job detail page.
 *
 * Booking-scoped: the report is filed against the customer on THIS job and
 * reviewed by Sweepr's Trust and Safety team. Separate from scope-review
 * requests (which move money); this is the safety/conduct channel. Photo
 * evidence uploads to the private report store through the API.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Flag, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, Button, Badge, Modal, Select, Textarea, toast } from "@sweepr/ui";
import { useAppToken } from "@/lib/appToken";

const API = import.meta.env.VITE_API_URL ?? "";

const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const CATEGORY_VALUES = [
  "safety_concern",
  "property_damage",
  "theft",
  "harassment",
  "no_show",
  "unprofessional_conduct",
  "payment_dispute",
  "other",
] as const;

const STATUS_BADGE: Record<string, { key: string; variant: "default" | "success" | "warning" | "error" | "info" }> = {
  submitted: { key: "cleaner.reports.status.submitted", variant: "info" },
  under_review: { key: "cleaner.reports.status.underReview", variant: "warning" },
  action_taken: { key: "cleaner.reports.status.actionTaken", variant: "success" },
  dismissed: { key: "cleaner.reports.status.dismissed", variant: "default" },
};

interface MyReport {
  id: string;
  reference: string;
  category: string;
  status: string;
  createdAt: string;
  photoCount: number;
}

export function ReportUserSection({ bookingId }: { bookingId: string }) {
  const { t } = useTranslation();
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
    void load();
  }, [load]);

  const hasOpenReport = reports.some((r) => r.status === "submitted" || r.status === "under_review");

  return (
    <>
      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-charcoal dark:text-white">
              <Flag className="h-4 w-4 text-slate-400" /> {t("cleaner.reports.title")}
            </p>
            <p className="mt-1 text-xs text-slate-500">{t("cleaner.reports.desc")}</p>
          </div>
          <Button variant="secondary" onClick={() => setOpen(true)} disabled={hasOpenReport}>
            {t("cleaner.reports.reportButton")}
          </Button>
        </div>

        {hasOpenReport && (
          <p className="text-xs text-slate-500">{t("cleaner.reports.openReportNotice")}</p>
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
                    {t(`cleaner.reports.categories.${r.category}`, {
                      defaultValue: r.category.replace(/_/g, " "),
                    })}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t("cleaner.reports.case", { reference: r.reference })} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant={STATUS_BADGE[r.status]?.variant ?? "default"}>
                  {STATUS_BADGE[r.status] ? t(STATUS_BADGE[r.status].key) : r.status.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {open && (
        <ReportUserModal
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

function ReportUserModal({
  bookingId,
  onClose,
  onSubmitted,
}: {
  bookingId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { t } = useTranslation();
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
        toast.error(t("cleaner.reports.photoTooLarge", { name: f.name }));
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
        toast.error(t("cleaner.reports.duplicateError"));
        onClose();
        return;
      }
      if (!res.ok || !body.id) {
        toast.error(body.error ?? t("cleaner.reports.genericError"));
        return;
      }

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
      toast.error(t("cleaner.reports.networkError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Modal open onOpenChange={() => onSubmitted()} title={t("cleaner.reports.submittedTitle")}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-seafoam-600 text-white">
            <Check className="h-5 w-5" />
          </span>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t("cleaner.reports.submittedMessage", { reference: result.reference })}
          </p>
          {result.photoWarning && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("cleaner.reports.photoWarning")}
            </p>
          )}
          <Button fullWidth onClick={onSubmitted}>
            {t("common.close")}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("cleaner.reports.modalTitle")}
      description={t("cleaner.reports.modalDesc")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canSubmit} loading={submitting}>
            {t("cleaner.reports.submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label={t("cleaner.reports.categoryLabel")}
          placeholder={t("cleaner.reports.categoryPlaceholder")}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={CATEGORY_VALUES.map((v) => ({
            value: v,
            label: t(`cleaner.reports.categories.${v}`),
          }))}
        />

        <Textarea
          label={t("cleaner.reports.descriptionLabel")}
          placeholder={t("cleaner.reports.descriptionPlaceholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          minLength={10}
        />

        <div>
          <p className="mb-1 text-sm font-medium text-charcoal dark:text-white">
            {t("cleaner.reports.photosLabel")}{" "}
            <span className="font-normal text-slate-400">
              ({t("cleaner.reports.photosOptional", { max: MAX_PHOTOS })})
            </span>
          </p>
          <div className="grid grid-cols-4 gap-2">
            {files.map((f) => (
              <div key={f.previewUrl} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                <img src={f.previewUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(f.previewUrl)}
                  aria-label={t("cleaner.reports.removePhoto")}
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
                aria-label={t("cleaner.reports.addPhoto")}
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
          {t("cleaner.reports.whatHappensNext")}
        </div>
      </div>
    </Modal>
  );
}
