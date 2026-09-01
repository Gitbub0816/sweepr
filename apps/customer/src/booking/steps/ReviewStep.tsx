/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Home, CalendarClock, Sparkles, Zap, Repeat, Check } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { useAppToken } from "@/lib/appToken";
import { useTranslation } from "react-i18next";
import { Card, Textarea, toast } from "@sweepr/ui";
import {
  formatDate,
  formatCurrency,
  getAddOn,
  recurringDisplayPrice,
} from "@sweepr/utils";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";
import { deriveCleaningLevel, ROOM_TYPES, LEVEL_CAPTIONS } from "../roomAssets";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-700 dark:bg-slate-800">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xs text-slate-600">{label}</p>
        <p className="text-sm font-medium text-charcoal dark:text-white">
          {value}
        </p>
      </div>
    </div>
  );
}

function formatWindowTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-seafoam-700 first:mt-0 dark:text-seafoam-300">
      {children}
    </p>
  );
}

export function ReviewStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getToken } = useAppToken();
  const state = useBookingStore();
  const {
    address,
    home,
    serviceType,
    rooms,
    clutter,
    roomCountsByLevel,
    addOnKeys,
    extraCleanerRequested,
    petHairLevel,
    scheduledFor,
    arrivalWindowStart,
    arrivalWindowEnd,
    notes,
    isEmergency,
    isSubscription,
    subscriptionCadence,
    setBookingId,
  } = state;
  const [submitting, setSubmitting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  // Room conditions drive the price, but the customer never sees any number
  // until here — and only the final owed total, fetched server-authoritatively.
  const derivedLevel = deriveCleaningLevel(rooms);
  const [total, setTotal] = useState<number | null>(null);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteErrorMessage, setQuoteErrorMessage] = useState<string | null>(null);
  // Labeled admin calendar date adjustment included in the server total
  // (label is admin-configured; rendered verbatim, never hardcoded here).
  const [dateAdjustment, setDateAdjustment] = useState<{ label: string; cents: number } | null>(
    null,
  );
  // Pricing v2 explanation (present once a v2 pricing version is live).
  const [v2Info, setV2Info] = useState<{
    roomInference: Array<{
      roomType: string;
      count: number;
      reportedMaximumLevel: number;
      method: string;
    }>;
    estimatedElapsedMinutes: number;
    recommendedTeamSize: number;
    /** Pricing v2 auto-classified this booking as a Deep Clean. */
    deepCleanApplied?: boolean;
    /** The server will refuse instant booking; formal copy explains why. */
    manualReviewBlocked?: boolean;
    manualReviewMessage?: string | null;
  } | null>(null);

  const roomsComplete = ROOM_TYPES.every((r) => rooms.some((s) => s.roomType === r.type));
  const missingRequiredFields =
    !address ||
    !serviceType ||
    !scheduledFor ||
    !arrivalWindowStart ||
    !arrivalWindowEnd ||
    !roomsComplete;
  useEffect(() => {
    if (!address || !serviceType) navigate("/book/address");
    else if (!roomsComplete) navigate("/book/rooms");
    else if (!scheduledFor || !arrivalWindowStart || !arrivalWindowEnd) navigate("/book/schedule");
  }, [address, serviceType, scheduledFor, arrivalWindowStart, arrivalWindowEnd, roomsComplete, navigate]);

  // Fetch the final owed amount from the server (authoritative). Hidden until now.
  useEffect(() => {
    if (missingRequiredFields) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${API_URL}/bookings/quote`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            serviceType,
            bedrooms: home.bedrooms,
            bathrooms: home.bathrooms,
            sqft: home.sqft,
            homeType: home.homeType,
            hasPets: home.pets,
            cleaningLevel: derivedLevel,
            rooms,
            clutter,
            roomCountsByLevel,
            addOnKeys,
            extraCleanerRequested,
            ...(petHairLevel ? { petHairLevel } : {}),
            scheduledAt: scheduledFor,
            // Customer's UTC offset so the server matches calendar rules
            // against the LOCAL date the customer picked.
            timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
            // Address coordinates (preview only): resolve any area-scoped
            // date rule before the address row exists.
            ...(address?.lat != null && address?.lng != null
              ? { lat: address.lat, lng: address.lng }
              : {}),
          }),
        });
        if (!res.ok) {
          // A blocked date returns a formal message worth showing verbatim.
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          if (!cancelled) {
            setQuoteError(true);
            setQuoteErrorMessage(err.message ?? null);
          }
          return;
        }
        const data = (await res.json()) as {
          total?: number;
          price?: {
            totalPrice?: number;
            dateAdjustment?: { label: string; cents: number };
          };
          v2?: NonNullable<typeof v2Info>;
        };
        const dollars =
          data.total ??
          (data.price?.totalPrice != null ? data.price.totalPrice / 100 : null);
        if (!cancelled && dollars != null) {
          setTotal(dollars);
          setV2Info(data.v2 ?? null);
          setDateAdjustment(data.price?.dateAdjustment ?? null);
        } else if (!cancelled) setQuoteError(true);
      } catch {
        if (!cancelled) setQuoteError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [missingRequiredFields, serviceType, home, derivedLevel, rooms, addOnKeys, extraCleanerRequested, petHairLevel, scheduledFor, getToken]);

  if (missingRequiredFields) return null;

  const subPrice =
    total != null && isSubscription && subscriptionCadence
      ? recurringDisplayPrice(total, subscriptionCadence)
      : null;

  const addOnSummary = addOnKeys.map((k) => getAddOn(k)?.name).filter(Boolean) as string[];

  async function handleContinueToPayment() {
    setSubmitting(true);
    try {
      const token = await getToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // Save address to DB first, get addressId back.
      let addressId: string | undefined;
      try {
        const addrRes = await fetch(`${API_URL}/customer-profile/addresses`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            street: address!.line1,
            city: address!.city,
            state: address!.state,
            zip: address!.zip,
            lat: address!.lat,
            lng: address!.lng,
            makeDefault: !address?.id,
          }),
        });
        if (addrRes.ok) {
          const data = (await addrRes.json()) as { id: string };
          addressId = data.id;
        }
      } catch {
        // Non-fatal: booking can be created without an addressId.
      }

      // Create the booking in the database.
      const res = await fetch(`${API_URL}/bookings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          serviceType,
          bedrooms: home.bedrooms,
          bathrooms: home.bathrooms,
          sqft: home.sqft,
          homeType: home.homeType,
          hasPets: home.pets,
          cleaningLevel: derivedLevel,
          rooms,
          clutter,
          roomCountsByLevel,
          addOnKeys,
          extraCleanerRequested,
          ...(petHairLevel ? { petHairLevel } : {}),
          scheduledAt: scheduledFor,
          arrivalWindowStart,
          arrivalWindowEnd,
          // Customer's UTC offset: the server builds the arrival instant from
          // the LOCAL booking date and matches calendar date rules against it.
          timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
          notes: notes || undefined,
          ...(addressId ? { addressId } : {}),
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(err.message ?? err.error ?? "Failed to create booking");
      }

      const data = (await res.json()) as { booking: { id: string } };
      setBookingId(data.booking.id);

      // Also update the customer's home profile defaults for future pre-fills.
      try {
        await fetch(`${API_URL}/customer-profile`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            homeBedrooms: home.bedrooms,
            homeBathrooms: home.bathrooms,
            homeSqft: home.sqft,
            homeType: home.homeType,
            hasPets: home.pets,
          }),
        });
      } catch {
        // Non-fatal.
      }

      navigate("/book/payment");
    } catch (err) {
      toast.error((err as Error).message || t("errors.couldNotCreateBooking"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StepShell
      title={t("booking.review.title")}
      subtitle={t("booking.review.subtitle")}
      onBack={() => navigate("/book/schedule")}
      onNext={handleContinueToPayment}
      nextLabel={submitting ? t("booking.review.creatingBooking") : t("booking.review.continueToPayment")}
      nextDisabled={submitting || !acknowledged || total == null || v2Info?.manualReviewBlocked === true}
    >
      {v2Info?.manualReviewBlocked && (
        <Card className="mb-4 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {v2Info.manualReviewMessage ??
              "This booking needs a quick review by our team before it can be confirmed."}
          </p>
        </Card>
      )}
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        <Row
          icon={MapPin}
          label={t("booking.review.address")}
          value={`${address.line1}, ${address.city}, ${address.state} ${address.zip}`}
        />
        <Row
          icon={Home}
          label={t("booking.review.home")}
          value={`${home.bedrooms} bd · ${home.bathrooms} ba · ${home.sqft} sqft · ${home.homeType}`}
        />
        <Row
          icon={Sparkles}
          label={t("booking.review.service")}
          value={t(`serviceTypes.${serviceType}`)}
        />
        <Row
          icon={CalendarClock}
          label={t("booking.review.scheduledFor")}
          value={
            arrivalWindowStart && arrivalWindowEnd
              ? t("booking.review.arrivesBetween", {
                  defaultValue: "{{date}}, Arrives between {{start}} – {{end}}",
                  date: formatDate(scheduledFor),
                  start: formatWindowTime(arrivalWindowStart),
                  end: formatWindowTime(arrivalWindowEnd),
                })
              : formatDate(scheduledFor)
          }
        />
      </Card>

      {/* Room-condition summary, labels only, NO per-item pricing. The single
          final owed amount below is the only number the customer sees. */}
      <Card className="mt-4">
        <SectionHeading>Rooms</SectionHeading>
        <p className="mb-2 text-xs text-slate-500">What you told us about each room.</p>
        {ROOM_TYPES.map((room) => {
          const sel = rooms.find((r) => r.roomType === room.type);
          if (!sel) return null;
          const inference = v2Info?.roomInference.find((ri) => ri.roomType === room.type);
          return (
            <div key={room.type} className="py-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">
                  {room.label}
                  {inference && inference.count > 1 ? ` ×${inference.count}` : ""}
                </span>
                <span className="font-medium text-charcoal dark:text-white">
                  {LEVEL_CAPTIONS[sel.level]}
                </span>
              </div>
              {inference && inference.count > 1 && inference.method === "inferred" && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  One reported at this condition; time for the remaining{" "}
                  {inference.count - 1 === 1 ? "room is" : "rooms is"} estimated from
                  your home details.
                </p>
              )}
            </div>
          );
        })}

        {/* Non-punitive scope note (only meaningful under Pricing v2). */}
        {v2Info && (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            We plan around what you've told us. If a room turns out to need
            substantially more work than described, your cleaner will check with
            you first — nothing extra is ever charged without your approval.
          </p>
        )}

        {addOnSummary.length > 0 && (
          <>
            <SectionHeading>Add-ons</SectionHeading>
            <div className="flex flex-wrap gap-2 py-1">
              {addOnSummary.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {name}
                </span>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card className="mt-4">
        {isEmergency && (
          <span className="mb-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            <Zap className="h-3 w-3" /> {t("booking.review.rushBooking")}
          </span>
        )}
        {v2Info?.deepCleanApplied && (
          <span className="mb-3 ml-1 inline-flex items-center gap-1 rounded-full bg-seafoam-100 px-3 py-1 text-xs font-semibold text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300">
            Deep Clean
          </span>
        )}
        {total == null ? (
          <div>
            <p className="text-sm text-slate-500">{t("booking.review.yourClean")}</p>
            <div className="mt-1 h-9 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            {quoteError && (
              <p className="mt-2 text-xs text-red-600">
                {quoteErrorMessage ??
                  "We couldn't calculate your total. Please go back and try again."}
              </p>
            )}
          </div>
        ) : subPrice != null ? (
          <div>
            <p className="text-sm text-slate-500">{t("booking.review.firstClean")}</p>
            <p className="text-3xl font-bold text-charcoal dark:text-white">
              {formatCurrency(total)}
            </p>
            <p className="mt-2 flex items-center gap-1 text-sm font-medium text-seafoam-700">
              <Repeat className="h-4 w-4" />
              {t("booking.review.then")} {formatCurrency(subPrice)} {t("booking.review.every")} {subscriptionCadence}
            </p>
            {total - subPrice > 0 && (
              <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {t("booking.review.savePerVisit", { amount: formatCurrency(total - subPrice) })}
              </span>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-500">{t("booking.review.yourClean")}</p>
            <p className="text-3xl font-bold text-charcoal dark:text-white">
              {formatCurrency(total)}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {t("booking.review.includesEverything")}
            </p>
          </div>
        )}
        {/* Labeled date pricing line (server-computed and already included in
            the total above). The label comes from the server, so any future
            breakdown line renders without a code change here. */}
        {total != null && dateAdjustment && (
          <p
            className={`mt-2 text-sm font-medium ${
              dateAdjustment.cents < 0 ? "text-seafoam-700" : "text-amber-700"
            }`}
          >
            {dateAdjustment.label}:{" "}
            {dateAdjustment.cents < 0 ? "-" : "+"}$
            {(Math.abs(dateAdjustment.cents) / 100).toFixed(2)}{" "}
            <span className="font-normal text-slate-500">
              {t("booking.review.includedInTotal", { defaultValue: "(included in your total)" })}
            </span>
          </p>
        )}
      </Card>

      <div className="mt-4">
        <Textarea
          label={t("booking.review.notesLabel")}
          placeholder={t("booking.review.notesPlaceholder")}
          value={notes}
          onChange={(e) => state.setNotes(e.target.value)}
        />
      </div>

      {/* Required scope acknowledgement, blocks payment until checked. */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
        <label className="flex cursor-pointer items-start gap-3">
          <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-slate-300 bg-white checked:border-seafoam-600 checked:bg-seafoam-600 dark:border-slate-600 dark:bg-slate-900"
              aria-describedby="ack-details"
            />
            <Check className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" />
          </span>
          <span className="text-sm font-medium text-charcoal dark:text-white">
            {t("booking.review.ackTitle")}
          </span>
        </label>
        <ul id="ack-details" className="mt-3 space-y-1.5 pl-8 text-xs text-slate-600 dark:text-slate-400">
          <li>{t("booking.review.ackScope")}</li>
          <li>{t("booking.review.ackDirty")}</li>
          <li>{t("booking.review.ackExcluded")}</li>
          <li>{t("booking.review.ackAddOns")}</li>
          <li>{t("booking.review.ackDecline")}</li>
          <li>{t("booking.review.ackRefusalFee")}</li>
          <li className="font-medium text-charcoal dark:text-slate-200">{t("booking.review.ackDisclosure")}</li>
        </ul>
      </div>
    </StepShell>
  );
}
