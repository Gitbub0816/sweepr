import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  MapPin, Home, Clock, Navigation, Play, CheckSquare, Camera,
  ArrowRight, ShieldCheck, Lock, AlertTriangle,
} from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { DashboardShell, Card, Button, ErrorState, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import { NavigationMap } from "../components/NavigationMap";

const API = import.meta.env.VITE_API_URL ?? "";

type DayStatus =
  | "confirmed"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "awaiting_checkout"
  | "completed";

interface JobLive {
  id: string;
  day_status: DayStatus | null;
  status: string;
  service_type: string;
  total_price: number;
  scheduled_at: string;
  // revealed after start-route
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
    lat: number | null;
    lng: number | null;
  };
  access_codes?: Array<{ code_type: string; code_value: string; notes?: string }>;
  photos?: Array<{ photo_type: string; storage_key: string; room_label?: string }>;
  arrival_verified_at?: string;
  started_at?: string;
  completed_at?: string;
}

const STEP_ORDER: DayStatus[] = [
  "confirmed",
  "en_route",
  "arrived",
  "in_progress",
  "awaiting_checkout",
  "completed",
];

export function JobDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [job, setJob] = useState<JobLive | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const watchRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoType, setPhotoType] = useState<"before" | "after" | "checkout">("before");
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);

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

  async function loadJob() {
    if (!id) return;
    try {
      const res = await authFetch(`/jobs/bookings/${id}/live`);
      if (!res.ok) { setError("Job not found"); return; }
      const data = (await res.json()) as { booking: JobLive };
      setJob(data.booking);
    } catch {
      setError("Failed to load job");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJob();
  }, [id]);

  // Stream GPS while en_route or in_progress
  useEffect(() => {
    if (!job || !id) return;
    const tracking = job.day_status === "en_route" || job.day_status === "in_progress";
    if (!tracking) {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      return;
    }
    if (!navigator.geolocation) return;

    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        const token = await getToken();
        const body = JSON.stringify({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          heading: pos.coords.heading ?? undefined,
          speedKmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
        });
        const res = await fetch(`${API}/jobs/bookings/${id}/location`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body,
        });
        if (res.ok) {
          const data = (await res.json()) as { arrived?: boolean };
          if (data.arrived) {
            toast.success("You've arrived! Tap 'Start Clean' to begin.");
            loadJob();
          }
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000 }
    );

    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [job?.day_status, id]);

  async function action(endpoint: string, body?: Record<string, unknown>) {
    if (!id) return;
    setBusy(true);
    try {
      const res = await authFetch(`/jobs/bookings/${id}/${endpoint}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? "Action failed");
        return;
      }
      await loadJob();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePhotoUpload(file: File, type: "before" | "after" | "checkout") {
    if (!id) return;
    setBusy(true);
    try {
      const token = await getToken();
      // Get presigned upload URL from storage route
      const signRes = await fetch(`${API}/storage/sign-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          purpose: "booking_photo",
          scope: "booking",
          refId: id,
        }),
      });
      if (!signRes.ok) throw new Error();
      const { uploadUrl, storageKey } = (await signRes.json()) as {
        uploadUrl: string;
        storageKey: string;
      };

      // Upload to R2
      await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });

      if (type === "checkout") {
        // Complete the job
        await action("complete", { checkoutPhotoKey: storageKey });
      } else {
        // Record photo
        await action("photos", { photoType: type, storageKey, roomLabel: "" });
      }
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} photo uploaded`);
    } catch {
      toast.error("Photo upload failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell title="Job Detail">
        <p className="text-slate-400 text-sm">Loading…</p>
      </DashboardShell>
    );
  }

  if (error || !job) {
    return (
      <ErrorState
        title={error || "Job not found"}
        action={
          <Link to="/jobs">
            <Button variant="secondary">Back to board</Button>
          </Link>
        }
      />
    );
  }

  const dayStatus = (job.day_status ?? "confirmed") as DayStatus;
  const stepIdx = STEP_ORDER.indexOf(dayStatus);
  const isCompleted = dayStatus === "completed";

  return (
    <DashboardShell
      title={t(`serviceTypes.${job.service_type}`, { defaultValue: job.service_type })}
      description={`Job ${job.id.slice(0, 8).toUpperCase()}`}
      actions={
        <span className="text-2xl font-bold text-charcoal dark:text-white">
          {formatCurrency(job.total_price / 100)}
        </span>
      }
    >
      {/* Progress stepper */}
      <Card className="p-4">
        <div className="flex items-center gap-0">
          {STEP_ORDER.map((step, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            return (
              <div key={step} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      done
                        ? "bg-emerald-500 text-white"
                        : active
                        ? "bg-seafoam-500 text-white"
                        : "bg-slate-200 text-slate-400"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </div>
                  <span className={`text-[10px] text-center leading-tight ${active ? "text-seafoam-600 font-semibold" : "text-slate-400"}`}>
                    {t(`cleaner.jobs.steps.${step}`, { defaultValue: step })}
                  </span>
                </div>
                {i < STEP_ORDER.length - 1 && (
                  <div className={`flex-1 h-0.5 mb-4 mx-1 ${i < stepIdx ? "bg-emerald-400" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Job info */}
      <Card className="space-y-4">
        <Detail icon={Clock} label="When" value={new Date(job.scheduled_at).toLocaleString()} />
        {job.address ? (
          <Detail
            icon={MapPin}
            label="Address"
            value={`${job.address.street}, ${job.address.city}, ${job.address.state} ${job.address.zip}`}
          />
        ) : (
          <Detail icon={MapPin} label="Address" value="Revealed when you start route" muted />
        )}
        {job.access_codes && job.access_codes.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Access</p>
            {job.access_codes.map((code) => (
              <div key={`${code.code_type}-${code.code_value}`} className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <Lock className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-900">{code.code_type}: {code.code_value}</span>
                {code.notes && <span className="text-xs text-slate-500 ml-1">({code.notes})</span>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Action buttons by step */}
      {!isCompleted && (
        <div className="space-y-3">
          {dayStatus === "confirmed" && (
            <Button fullWidth onClick={() => action("start-route")} loading={busy}>
              <Navigation className="h-4 w-4 mr-2" /> Start Route — Reveal Address
            </Button>
          )}

          {dayStatus === "en_route" && job.address && job.address.lat != null && job.address.lng != null && (
            <NavigationMap
              destination={{
                lat: job.address.lat,
                lng: job.address.lng,
                label: `${job.address.street}, ${job.address.city}, ${job.address.state} ${job.address.zip}`,
              }}
              currentLat={currentPos?.lat ?? null}
              currentLng={currentPos?.lng ?? null}
            />
          )}
          {dayStatus === "en_route" && !job.address && (
            <div className="rounded-lg bg-seafoam-50 border border-seafoam-200 px-4 py-3 text-sm text-seafoam-700 flex items-center gap-2">
              <Navigation className="h-4 w-4 animate-pulse" />
              GPS tracking active — auto-arrival within 150m
            </div>
          )}

          {dayStatus === "arrived" && (
            <Button fullWidth onClick={() => action("start-clean")} loading={busy}>
              <Play className="h-4 w-4 mr-2" /> Start Clean
            </Button>
          )}

          {dayStatus === "in_progress" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => { setPhotoType("before"); fileRef.current?.click(); }}
                  loading={busy}
                >
                  <Camera className="h-4 w-4 mr-1" /> Before Photo
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => { setPhotoType("after"); fileRef.current?.click(); }}
                  loading={busy}
                >
                  <Camera className="h-4 w-4 mr-1" /> After Photo
                </Button>
              </div>
              <Button fullWidth onClick={() => action("finish-clean")} loading={busy}>
                <CheckSquare className="h-4 w-4 mr-2" /> Finish Clean
              </Button>
            </div>
          )}

          {dayStatus === "awaiting_checkout" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Take a checkout photo of the property before you leave.</p>
              <Button
                fullWidth
                onClick={() => { setPhotoType("checkout"); fileRef.current?.click(); }}
                loading={busy}
              >
                <Camera className="h-4 w-4 mr-2" /> Take Checkout Photo &amp; Complete Job
              </Button>
            </div>
          )}
        </div>
      )}

      {isCompleted && (
        <Card className="flex items-center gap-3 bg-emerald-50 border-emerald-200 p-4">
          <ShieldCheck className="h-8 w-8 text-emerald-500 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-800">Job completed!</p>
            <p className="text-sm text-emerald-700">Payment will be released after checkout review.</p>
          </div>
        </Card>
      )}

      {/* Photos taken */}
      {job.photos && job.photos.length > 0 && (
        <Card className="space-y-2">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Photos ({job.photos.length})</p>
          <div className="grid grid-cols-3 gap-2">
            {job.photos.map((p) => (
              <div key={p.storage_key} className="rounded-lg bg-slate-100 aspect-square flex items-center justify-center">
                <Camera className="h-5 w-5 text-slate-300" />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Hidden file input for photos */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handlePhotoUpload(file, photoType);
          e.target.value = "";
        }}
      />
    </DashboardShell>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className={`text-sm font-medium ${muted ? "text-slate-400 italic" : "text-charcoal dark:text-white"}`}>
          {value}
        </p>
      </div>
    </div>
  );
}
