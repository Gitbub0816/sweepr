import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, X, ShieldAlert } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { Card, Button, Badge, Modal, Textarea, Select, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";

const API = import.meta.env.VITE_API_URL ?? "";

type RequestType = "additional_attention" | "refusal";
type RequestStatus =
  | "pending_ai"
  | "pending_admin"
  | "approved"
  | "denied"
  | "hard_denied"
  | "expired"
  | "cancelled";

interface Privileges {
  additionalAttentionEnabled: boolean;
  refusalRequestEnabled: boolean;
  disabledUntil: string | null;
  disabledReason: string | null;
  message: string | null;
}

interface ScopeRequest {
  id: string;
  bookingId: string;
  requestType: RequestType;
  status: RequestStatus;
  feeCode: string | null;
  feeAmountCents: number | null;
  createdAt: string;
  updatedAt: string;
}

const REFUSAL_REASON_VALUES = [
  "excessive_clutter",
  "hoarding",
  "unsafe_environment",
  "biohazard",
  "animal_hazard",
  "structural_hazard",
  "inaccessible",
  "scope_exceeded",
  "other",
] as const;

const ACTIVE_STATUSES: RequestStatus[] = ["pending_ai", "pending_admin"];

export function ScopeReviewSection({ bookingId }: { bookingId: string }) {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const [privileges, setPrivileges] = useState<Privileges | null>(null);
  const [requests, setRequests] = useState<ScopeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardType, setWizardType] = useState<RequestType | null>(null);

  const authFetch = useCallback(
    async (path: string, opts: RequestInit = {}) => {
      const token = await getToken();
      return fetch(`${API}${path}`, {
        ...opts,
        headers: {
          ...(opts.headers ?? {}),
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    },
    [getToken]
  );

  const load = useCallback(async () => {
    try {
      const [privRes, reqRes] = await Promise.all([
        authFetch(`/scope-review/privileges`),
        authFetch(`/scope-review/requests/mine?bookingId=${bookingId}`),
      ]);
      if (privRes.ok) setPrivileges((await privRes.json()) as Privileges);
      if (reqRes.ok) {
        const data = (await reqRes.json()) as { requests: ScopeRequest[] };
        setRequests(data.requests);
      }
    } catch {
      /* leave defaults; section will just hide entry points */
    } finally {
      setLoading(false);
    }
  }, [authFetch, bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;

  const activeAaf = requests.find(
    (r) => r.requestType === "additional_attention" && ACTIVE_STATUSES.includes(r.status)
  );
  const activeRefusal = requests.find(
    (r) => r.requestType === "refusal" && ACTIVE_STATUSES.includes(r.status)
  );

  return (
    <>
      <Card className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-charcoal dark:text-white">
            {t("cleaner.scopeReview.needMoreScopeTitle")}
          </p>
          <p className="text-xs text-slate-500">{t("cleaner.scopeReview.needMoreScopeDesc")}</p>
        </div>

        <RequestButton
          type="additional_attention"
          label={t("cleaner.scopeReview.requestAaf")}
          enabled={privileges?.additionalAttentionEnabled ?? true}
          disabledUntil={privileges?.disabledUntil ?? null}
          activeRequest={activeAaf}
          onClick={() => setWizardType("additional_attention")}
        />

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
            <AlertTriangle className="h-3.5 w-3.5" /> {t("cleaner.scopeReview.havingAnIssue")}
          </p>
          <RequestButton
            type="refusal"
            label={t("cleaner.scopeReview.requestRefusal")}
            enabled={privileges?.refusalRequestEnabled ?? true}
            disabledUntil={privileges?.disabledUntil ?? null}
            activeRequest={activeRefusal}
            onClick={() => setWizardType("refusal")}
            variant="secondary"
          />
        </div>
      </Card>

      {requests.length > 0 && (
        <Card className="space-y-3">
          <p className="text-xs text-slate-600 uppercase tracking-wide font-medium">
            {t("cleaner.scopeReview.yourRequests")}
          </p>
          <div className="space-y-2">
            {requests.map((r) => (
              <RequestStatusRow key={r.id} request={r} />
            ))}
          </div>
        </Card>
      )}

      {wizardType && (
        <ScopeReviewWizard
          bookingId={bookingId}
          requestType={wizardType}
          onClose={() => setWizardType(null)}
          onSubmitted={() => {
            setWizardType(null);
            load();
          }}
        />
      )}
    </>
  );
}

function RequestButton({
  type,
  label,
  enabled,
  disabledUntil,
  activeRequest,
  onClick,
  variant = "primary",
}: {
  type: RequestType;
  label: string;
  enabled: boolean;
  disabledUntil: string | null;
  activeRequest: ScopeRequest | undefined;
  onClick: () => void;
  variant?: "primary" | "secondary";
}) {
  const { t } = useTranslation();

  if (activeRequest) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-seafoam-50 border border-seafoam-200 px-3 py-2.5 dark:bg-seafoam-900/10 dark:border-seafoam-900/40">
        <span className="text-sm font-medium text-seafoam-800 dark:text-seafoam-200">{label}</span>
        <Badge variant="info">{t("cleaner.scopeReview.underReview")}</Badge>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="space-y-1">
        <Button fullWidth variant={variant} disabled>
          {label}
        </Button>
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
          <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {t("cleaner.scopeReview.temporarilyDisabled")}
            {disabledUntil &&
              ` ${t("cleaner.scopeReview.availableAgainOn", {
                date: new Date(disabledUntil).toLocaleDateString(),
              })}`}
          </span>
        </p>
      </div>
    );
  }

  return (
    <Button fullWidth variant={variant} onClick={onClick} type={type === "refusal" ? "button" : "button"}>
      {label}
    </Button>
  );
}

const STATUS_BADGE: Record<RequestStatus, { labelKey: string; variant: "default" | "success" | "warning" | "error" | "info" }> = {
  pending_ai: { labelKey: "cleaner.scopeReview.status.pendingAi", variant: "info" },
  pending_admin: { labelKey: "cleaner.scopeReview.status.pendingAdmin", variant: "info" },
  approved: { labelKey: "cleaner.scopeReview.status.approved", variant: "success" },
  denied: { labelKey: "cleaner.scopeReview.status.denied", variant: "error" },
  hard_denied: { labelKey: "cleaner.scopeReview.status.denied", variant: "error" },
  expired: { labelKey: "cleaner.scopeReview.status.expired", variant: "default" },
  cancelled: { labelKey: "cleaner.scopeReview.status.cancelled", variant: "default" },
};

function RequestStatusRow({ request }: { request: ScopeRequest }) {
  const { t } = useTranslation();
  const badge = STATUS_BADGE[request.status];
  const typeLabel =
    request.requestType === "additional_attention"
      ? t("cleaner.scopeReview.aafShort")
      : t("cleaner.scopeReview.refusalShort");

  let detail: string | null = null;
  if (request.requestType === "additional_attention") {
    if (request.status === "approved" && request.feeAmountCents != null) {
      detail = t("cleaner.scopeReview.approvedAafDetail", {
        amount: formatCurrency(request.feeAmountCents / 100),
      });
    } else if (request.status === "denied" || request.status === "hard_denied") {
      detail = t("cleaner.scopeReview.deniedAafDetail");
    }
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-charcoal dark:text-white">{typeLabel}</span>
        <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>
      </div>
      {detail && <p className="text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

// ─── Wizard ─────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3;

function ScopeReviewWizard({
  bookingId,
  requestType,
  onClose,
  onSubmitted,
}: {
  bookingId: string;
  requestType: RequestType;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const [step, setStep] = useState<WizardStep>(1);
  const [photos, setPhotos] = useState<{ key: string; previewUrl: string; file: File }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState("");
  const [refusalReason, setRefusalReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hardDenyMessage, setHardDenyMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const title =
    requestType === "additional_attention"
      ? t("cleaner.scopeReview.aafWizardTitle")
      : t("cleaner.scopeReview.refusalWizardTitle");

  async function addPhotos(files: FileList) {
    const remaining = 20 - photos.length;
    const toUpload = Array.from(files).slice(0, remaining);
    if (toUpload.length === 0) return;
    setUploading(true);
    try {
      const token = await getToken();
      const uploaded: { key: string; previewUrl: string; file: File }[] = [];
      for (const file of toUpload) {
        const signRes = await fetch(`${API}/storage/sign-upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            sizeBytes: file.size,
            purpose: "booking_photo",
            scope: "booking",
            refId: bookingId,
          }),
        });
        if (!signRes.ok) throw new Error();
        const { uploadUrl, storageKey } = (await signRes.json()) as {
          uploadUrl: string;
          storageKey: string;
        };
        await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        uploaded.push({ key: storageKey, previewUrl: URL.createObjectURL(file), file });
      }
      setPhotos((prev) => [...prev, ...uploaded]);
    } catch {
      toast.error(t("cleaner.scopeReview.photoUploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(key: string) {
    setPhotos((prev) => prev.filter((p) => p.key !== key));
  }

  const notesValid = notes.trim().length >= 10;
  const canProceedStep1 = photos.length >= 2;
  const canProceedStep2 = requestType === "additional_attention" ? notesValid : notesValid && !!refusalReason;

  async function submit() {
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/scope-review/requests`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          requestType,
          notes,
          refusalReason: requestType === "refusal" ? refusalReason : undefined,
          photoKeys: photos.map((p) => p.key),
        }),
      });
      const body = (await res.json()) as { id?: string; status?: string; message?: string; error?: string };

      if (res.status === 409) {
        toast.error(t("cleaner.scopeReview.alreadyActive"));
        onClose();
        return;
      }
      if (!res.ok) {
        toast.error(body.error || body.message || t("cleaner.scopeReview.genericError"));
        return;
      }
      if (body.status === "hard_denied") {
        setHardDenyMessage(body.message || t("cleaner.scopeReview.genericHardDeny"));
        setSubmitted(true);
        return;
      }
      setSubmitted(true);
    } catch {
      toast.error(t("cleaner.scopeReview.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Modal open onOpenChange={() => { onSubmitted(); }} title={title}>
        {hardDenyMessage ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">{hardDenyMessage}</p>
            <Button fullWidth onClick={onSubmitted}>
              {t("common.done", { defaultValue: "Done" })}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t("cleaner.scopeReview.submittedMessage")}
            </p>
            <Button fullWidth onClick={onSubmitted}>
              {t("common.done", { defaultValue: "Done" })}
            </Button>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={title} className="max-w-lg">
      <div className="space-y-5">
        <p className="text-xs text-slate-500">
          {t("cleaner.scopeReview.stepIndicator", { step, total: 3 })}
        </p>

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t("cleaner.scopeReview.photosStepDesc")}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {photos.map((p) => (
                <div key={p.key} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
                  <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(p.key)}
                    aria-label="Remove photo"
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {photos.length < 20 && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-seafoam-400 hover:text-seafoam-600 dark:border-slate-700"
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
                if (e.target.files) addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-slate-500">
              {t("cleaner.scopeReview.photosCount", { count: photos.length })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button onClick={() => setStep(2)} disabled={!canProceedStep1 || uploading} loading={uploading}>
                {t("common.next", { defaultValue: "Next" })}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && requestType === "additional_attention" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t("cleaner.scopeReview.aafHelperCopy")}
            </p>
            <Textarea
              label={t("cleaner.scopeReview.explanationLabel")}
              placeholder={t("cleaner.scopeReview.explanationPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              minLength={10}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep(1)}>
                {t("common.back", { defaultValue: "Back" })}
              </Button>
              <Button onClick={() => setStep(3)} disabled={!canProceedStep2}>
                {t("common.next", { defaultValue: "Next" })}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && requestType === "refusal" && (
          <div className="space-y-3">
            <Select
              label={t("cleaner.scopeReview.refusalReasonLabel")}
              placeholder={t("cleaner.scopeReview.refusalReasonPlaceholder")}
              value={refusalReason}
              onChange={(e) => setRefusalReason(e.target.value)}
              options={REFUSAL_REASON_VALUES.map((v) => ({
                value: v,
                label: t(`cleaner.scopeReview.refusalReasons.${v}`),
              }))}
            />
            <Textarea
              label={t("cleaner.scopeReview.refusalNotesLabel")}
              placeholder={t("cleaner.scopeReview.explanationPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              minLength={10}
            />
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 flex items-start gap-2 dark:bg-amber-900/10 dark:border-amber-900/40 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{t("cleaner.scopeReview.refusalWarning")}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep(1)}>
                {t("common.back", { defaultValue: "Back" })}
              </Button>
              <Button onClick={() => setStep(3)} disabled={!canProceedStep2}>
                {t("common.next", { defaultValue: "Next" })}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-charcoal dark:text-white">
              {t("cleaner.scopeReview.reviewTitle")}
            </p>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 space-y-1.5 text-sm">
              <p>
                <span className="text-slate-500">{t("cleaner.scopeReview.typeLabel")}: </span>
                {requestType === "additional_attention"
                  ? t("cleaner.scopeReview.aafShort")
                  : t("cleaner.scopeReview.refusalShort")}
              </p>
              {requestType === "refusal" && refusalReason && (
                <p>
                  <span className="text-slate-500">{t("cleaner.scopeReview.reasonLabel")}: </span>
                  {t(`cleaner.scopeReview.refusalReasons.${refusalReason}`)}
                </p>
              )}
              <p>
                <span className="text-slate-500">{t("cleaner.scopeReview.notesLabel")}: </span>
                {notes}
              </p>
              <p>
                <span className="text-slate-500">{t("cleaner.scopeReview.photosCountLabel")}: </span>
                {photos.length}
              </p>
            </div>
            {requestType === "additional_attention" && (
              <p className="text-xs text-slate-500">{t("cleaner.scopeReview.aafHelperCopy")}</p>
            )}
            {requestType === "refusal" && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 flex items-start gap-2 dark:bg-amber-900/10 dark:border-amber-900/40 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{t("cleaner.scopeReview.refusalWarning")}</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep(2)} disabled={submitting}>
                {t("common.back", { defaultValue: "Back" })}
              </Button>
              <Button onClick={submit} loading={submitting}>
                {t("cleaner.scopeReview.submit")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
