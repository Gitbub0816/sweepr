import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { MapPin, CalendarClock, Check, Star } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  DashboardShell,
  Card,
  StatusBadge,
  PriceSummary,
  ErrorState,
  Button,
  Modal,
  Textarea,
  toast,
} from "@sweepr/ui";
import {
  formatDateTime,
  getAddOn,
  TRACKING_STEPS,
  JOB_STATUS_LABELS,
} from "@sweepr/utils";
import { useAuth } from "@clerk/clerk-react";
import { fetchBooking } from "../data/bookings";
import type { Booking } from "@sweepr/types";
import { CleanerTracker } from "../components/CleanerTracker";

const API = import.meta.env.VITE_API_URL ?? "";

const TAG_KEYS = [
  "bookingDetail.tags.arrivedOnTime",
  "bookingDetail.tags.veryThorough",
  "bookingDetail.tags.greatCommunication",
  "bookingDetail.tags.leftHomeSpotless",
  "bookingDetail.tags.friendly",
] as const;

const TAG_MAP: Record<string, "on_time" | "thorough" | "communication" | "spotless" | "friendly"> = {
  "bookingDetail.tags.arrivedOnTime": "on_time",
  "bookingDetail.tags.veryThorough": "thorough",
  "bookingDetail.tags.greatCommunication": "communication",
  "bookingDetail.tags.leftHomeSpotless": "spotless",
  "bookingDetail.tags.friendly": "friendly",
};

function ReviewModal({
  open,
  onOpenChange,
  cleanerName,
  bookingId,
  cleanerId,
  getToken,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cleanerName: string;
  bookingId: string;
  cleanerId: string | undefined;
  getToken: () => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (tagKey: string) =>
    setTags((prev) =>
      prev.includes(tagKey) ? prev.filter((x) => x !== tagKey) : [...prev, tagKey]
    );

  const submit = async () => {
    if (!cleanerId) { toast.error(t("bookingDetail.noCleanerAssigned")); return; }
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          bookingId,
          cleanerId,
          rating,
          comment: comment.trim() || undefined,
          tags: tags.map((tagKey) => TAG_MAP[tagKey]).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error();
      setSubmitted(true);
      setTimeout(() => onOpenChange(false), 1200);
    } catch {
      toast.error(t("bookingDetail.couldNotSubmitReview"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("bookingDetail.reviewTitle")}
      description={submitted ? undefined : t("bookingDetail.howDidItGo", { name: cleanerName })}
      footer={
        submitted ? undefined : (
          <Button onClick={submit} disabled={rating === 0 || submitting} className="w-full">
            {submitting ? t("bookingDetail.submitting") : t("bookingDetail.submitReview")}
          </Button>
        )
      }
    >
      {submitted ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t("bookingDetail.thanksFeedback")}
        </p>
      ) : (
        <div className="space-y-5">
          <div
            className="flex justify-center gap-2"
            role="radiogroup"
            aria-label={t("bookingDetail.starRating")}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={n > 1 ? t("bookingDetail.starsLabel", { n }) : t("bookingDetail.starLabel", { n })}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500"
              >
                <Star
                  className={`h-10 w-10 transition-colors ${
                    n <= (hover || rating)
                      ? "fill-amber-400 text-amber-400"
                      : "text-slate-300 dark:text-slate-600"
                  }`}
                />
              </button>
            ))}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-charcoal dark:text-white">
              What did {cleanerName} do great?
            </p>
            <div className="flex flex-wrap gap-2">
              {TAG_KEYS.map((tagKey) => (
                <button
                  key={tagKey}
                  type="button"
                  aria-pressed={tags.includes(tagKey)}
                  onClick={() => toggleTag(tagKey)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500 ${
                    tags.includes(tagKey)
                      ? "border-seafoam-500 bg-seafoam-50 text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300"
                      : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  {t(tagKey)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="review-comment"
              className="mb-1 block text-sm font-medium text-charcoal dark:text-white"
            >
              Comment (optional)
            </label>
            <Textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us more about your experience"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

export function BookingDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { getToken } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    getToken().then((tk) => setAuthToken(tk ?? null)).catch(() => {});
  }, [getToken]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    fetchBooking(getToken, id).then((b) => {
      if (!active) return;
      setBooking(b);
      setReviewOpen(b?.status === "completed_pending_review");
      setLoading(false);
    });
    return () => { active = false; };
  }, [id, getToken]);

  if (loading) {
    return (
      <DashboardShell title="Booking" description="">
        <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </DashboardShell>
    );
  }

  if (!booking) {
    return (
      <ErrorState
        title="Booking not found"
        description="We couldn't find that booking."
        action={
          <Link to="/bookings">
            <Button variant="secondary">{t("common.back")}</Button>
          </Link>
        }
      />
    );
  }

  const currentIdx = TRACKING_STEPS.indexOf(booking.status);
  const isActive =
    currentIdx >= 0 && booking.status !== "completed";
  const needsReview = booking.status === "completed_pending_review";
  const canReview = needsReview || booking.status === "completed";

  // In-progress mock completion estimate.
  const durationMin = 120;
  const start = new Date(booking.scheduledFor).getTime();
  const end = start + durationMin * 60_000;
  const remainingMs = Math.max(0, end - Date.now());
  const remainingH = Math.floor(remainingMs / 3_600_000);
  const remainingM = Math.floor((remainingMs % 3_600_000) / 60_000);
  const progressPct = Math.min(
    100,
    Math.max(0, ((Date.now() - start) / (end - start)) * 100)
  );

  return (
    <DashboardShell
      title={t(`serviceTypes.${booking.serviceType}`)}
      description={`Booking ${booking.id}`}
      actions={
        <div className="flex items-center gap-2">
          {isActive && (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300"
            >
              <motion.span
                className="h-2 w-2 rounded-full bg-green-500"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.4 }}
              />
              Live updates
            </span>
          )}
          <StatusBadge status={booking.status} />
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {authToken && id && (booking.status === "cleaner_on_the_way" || booking.status === "arrived" || booking.status === "in_progress") && (
            <CleanerTracker
              bookingId={id}
              token={authToken}
              apiUrl={API}
              dayStatus={booking.status === "cleaner_on_the_way" ? "en_route" : booking.status}
              destLat={booking.address.lat}
              destLng={booking.address.lng}
            />
          )}

          {booking.status === "in_progress" && (
            <Card>
              <h2 className="text-sm font-semibold text-charcoal dark:text-white">
                Your home is being cleaned
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Estimated completion in {remainingH}h {remainingM}m
              </p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <motion.div
                  className="h-full rounded-full bg-seafoam-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
            </Card>
          )}

          {canReview && (
            <Card className={`flex items-center justify-between ${needsReview ? "bg-seafoam-50 dark:bg-seafoam-900/20" : "bg-slate-50 dark:bg-slate-800/40"}`}>
              <div>
                <h2 className="text-sm font-semibold text-charcoal dark:text-white">
                  {needsReview ? "Complete — rate your clean" : "How did it go?"}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {needsReview ? "Let us know how it went." : "Leave an optional rating for your cleaner."}
                </p>
              </div>
              <Button variant={needsReview ? "primary" : "secondary"} onClick={() => setReviewOpen(true)}>
                {needsReview ? "Leave a review" : "Rate"}
              </Button>
            </Card>
          )}

          <Card>
            <h2 className="text-sm font-semibold text-charcoal dark:text-white">
              Status tracker
            </h2>
            <ol className="mt-4">
              {TRACKING_STEPS.map((s, i) => {
                const done = currentIdx >= 0 && i < currentIdx;
                const current = i === currentIdx;
                const last = i === TRACKING_STEPS.length - 1;
                return (
                  <li key={s} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full ${
                          done
                            ? "bg-seafoam-500 text-white"
                            : current
                              ? "bg-seafoam-500"
                              : "bg-slate-100 dark:bg-slate-800"
                        }`}
                      >
                        {done ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : current ? (
                          <motion.span
                            className="h-2 w-2 rounded-full bg-white"
                            animate={{ scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }}
                            transition={{ repeat: Infinity, duration: 1.4 }}
                          />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                        )}
                      </span>
                      {!last && (
                        <span
                          className={`my-1 w-0.5 flex-1 ${
                            done
                              ? "bg-seafoam-500"
                              : "border-l border-dashed border-slate-200 dark:border-slate-700"
                          }`}
                          style={{ minHeight: 20 }}
                        />
                      )}
                    </div>
                    <span
                      className={`pb-4 text-sm ${
                        done || current
                          ? "font-medium text-charcoal dark:text-white"
                          : "text-slate-400"
                      }`}
                    >
                      {JOB_STATUS_LABELS[s]}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-charcoal dark:text-white">
              Details
            </h2>
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <CalendarClock className="h-4 w-4 text-seafoam-500" />
              {formatDateTime(booking.scheduledFor)}
            </p>
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <MapPin className="h-4 w-4 text-seafoam-500" />
              {booking.address.line1}, {booking.address.city},{" "}
              {booking.address.state} {booking.address.zip}
            </p>
            <p className="text-sm text-slate-500">
              {booking.home.bedrooms} bd · {booking.home.bathrooms} ba ·{" "}
              {booking.home.sqft} sqft
            </p>
            {booking.addOnKeys.length > 0 && (
              <p className="text-sm text-slate-500">
                {t("booking.review.addOns")}:{" "}
                {booking.addOnKeys.map((k) => getAddOn(k)?.name).join(", ")}
              </p>
            )}
          </Card>
        </div>

        <PriceSummary quote={booking.quote} />
      </div>

      <ReviewModal
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        cleanerName="your cleaner"
        bookingId={booking.id}
        cleanerId={booking.cleanerId}
        getToken={getToken}
      />
    </DashboardShell>
  );
}
