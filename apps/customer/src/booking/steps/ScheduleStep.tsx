/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@clerk/clerk-react";
import { useAppToken } from "@/lib/appToken";
import { Zap, Repeat, Clock, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SweeprCalendar } from "@sweepr/ui";
import { cn } from "@sweepr/utils";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";
import {
  SELECTABLE_OPTION_BASE,
  SELECTABLE_OPTION_SELECTED,
  SELECTABLE_OPTION_UNSELECTED,
  SELECTABLE_OPTION_DISABLED,
} from "../../lib/selectableOption";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

interface AvailabilitySlot {
  start: string; // "08:00"
  end: string; // "10:00"
  label: string; // "8:00 – 10:00 AM"
  available: boolean;
}

interface AvailabilitySlotsResponse {
  date: string;
  slots: AvailabilitySlot[];
}

/** One entry per date carrying a calendar rule (GET /calendar/availability). */
interface CalendarDayInfo {
  date: string;
  blocked?: boolean;
  adjustmentLabel?: string;
  promoLabel?: string;
}

function dateKey(d: Date) {
  // Local calendar date (what the customer sees on the picker) — NOT the UTC
  // date of the instant, which rolls forward for evening times.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ScheduleStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    address,
    scheduledAt,
    arrivalWindowStart,
    arrivalWindowEnd,
    isEmergency,
    isSubscription,
    subscriptionCadence,
    setSchedule,
    clearSchedule,
    setArrivalWindow,
    setSubscription,
  } = useBookingStore();

  const { getToken } = useAppToken();

  const [pickedDate, setPickedDate] = useState<Date | null>(
    scheduledAt ? new Date(scheduledAt) : null
  );
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  // Admin calendar rules for the visible month: blocked dates (greyed out on
  // the picker, no reason shown) + date pricing/promotion labels. Advisory
  // only — the server re-checks at quote and booking creation.
  const [calendarDays, setCalendarDays] = useState<Record<string, CalendarDayInfo>>({});
  const [visibleMonth, setVisibleMonth] = useState<Date | null>(null);

  useEffect(() => {
    if (!visibleMonth) return;
    let cancelled = false;
    const y = visibleMonth.getFullYear();
    const m = visibleMonth.getMonth();
    const from = dateKey(new Date(y, m, 1));
    const to = dateKey(new Date(y, m + 1, 0));
    const params = new URLSearchParams({ from, to });
    if (address?.lat != null && address?.lng != null) {
      params.set("lat", String(address.lat));
      params.set("lng", String(address.lng));
    }
    fetch(`${API_URL}/calendar/availability?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("availability failed");
        return (await res.json()) as { days: CalendarDayInfo[] };
      })
      .then((data) => {
        if (cancelled) return;
        setCalendarDays((prev) => {
          const next = { ...prev };
          for (const d of data.days ?? []) next[d.date] = d;
          return next;
        });
      })
      .catch(() => {
        // Best-effort: without this data every date stays selectable and the
        // server still enforces blocks at booking time.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMonth ? dateKey(visibleMonth) : null, address?.lat, address?.lng]);

  const blockedDates = useMemo(
    () => Object.values(calendarDays).filter((d) => d.blocked).map((d) => d.date),
    [calendarDays]
  );
  const dateMarkers = useMemo(() => {
    const out: Record<string, string> = {};
    for (const d of Object.values(calendarDays)) {
      const label = d.blocked ? null : d.adjustmentLabel ?? d.promoLabel ?? null;
      if (label) out[d.date] = label;
    }
    return out;
  }, [calendarDays]);

  // If a stored draft points at a date that has since been blocked, clear it.
  useEffect(() => {
    if (pickedDate && calendarDays[dateKey(pickedDate)]?.blocked) {
      setPickedDate(null);
      setArrivalWindow(null);
      clearSchedule();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockedDates.join(","), pickedDate ? dateKey(pickedDate) : null]);

  const pickedDayInfo = pickedDate ? calendarDays[dateKey(pickedDate)] : undefined;


  const cadences = [
    { value: "weekly" as const, label: t("booking.schedule.weekly") },
    { value: "biweekly" as const, label: t("booking.schedule.biweekly") },
    { value: "monthly" as const, label: t("booking.schedule.monthly") },
  ];

  // Fetch the six 2-hour arrival windows and their real availability for the
  // picked date whenever the date changes. Selecting a new date invalidates
  // any previously chosen window.
  useEffect(() => {
    if (!pickedDate) {
      setSlots(null);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    setSlotsError(null);
    const params = new URLSearchParams({ date: dateKey(pickedDate) });
    if (address?.zip) params.set("zip", address.zip);
    // /cleaners/* requires auth — attach the Clerk token or the request 401s.
    getToken()
      .then((token) =>
        fetch(`${API_URL}/cleaners/availability-slots?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
      )
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load availability");
        return (await res.json()) as AvailabilitySlotsResponse;
      })
      .then((data) => {
        if (!cancelled) setSlots(data.slots ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setSlots(null);
          setSlotsError(t("booking.schedule.availabilityError", {
            defaultValue: "Couldn't load availability for this date. Please try again.",
          }));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedDate ? dateKey(pickedDate) : null, address?.zip]);

  const hasAnyAvailability = useMemo(
    () => (slots ?? []).some((s) => s.available),
    [slots]
  );

  function onDateChange(d: Date) {
    setPickedDate(d);
    // Changing the date clears any previously chosen window and the
    // finalized schedule until a new window is picked.
    setArrivalWindow(null);
    clearSchedule();
  }

  function onSelectWindow(slot: AvailabilitySlot) {
    if (!pickedDate || !slot.available) return;
    const [h, m] = slot.start.split(":").map(Number);
    const d = new Date(pickedDate);
    d.setHours(h, m, 0, 0);
    setSchedule(d.toISOString());
    setArrivalWindow({ start: slot.start, end: slot.end });
  }

  return (
    <StepShell
      title={t("booking.schedule.title")}
      subtitle={t("booking.schedule.arrivalWindowSubtitle", {
        defaultValue: "Pick a date, then choose a 2-hour arrival window. Your cleaner will arrive sometime within that window.",
      })}
      onBack={() => navigate("/book/addons")}
      onNext={() => navigate("/book/review")}
      nextDisabled={!scheduledAt || !arrivalWindowStart || !arrivalWindowEnd}
    >
      <SweeprCalendar
        mode="customer-booking"
        selectedDate={pickedDate ?? undefined}
        onDateChange={onDateChange}
        disabledDates={blockedDates}
        dateMarkers={dateMarkers}
        onMonthChange={setVisibleMonth}
      />

      {pickedDate && (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-charcoal dark:text-white">
            <Clock className="h-4 w-4 text-seafoam-600" aria-hidden="true" />
            {t("booking.schedule.chooseArrivalWindow", { defaultValue: "Choose an arrival window" })}
          </p>

          {loadingSlots && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="status" aria-label="Loading availability">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"
                />
              ))}
            </div>
          )}

          {!loadingSlots && slotsError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {slotsError}
            </div>
          )}

          {!loadingSlots && !slotsError && slots && slots.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {slots.map((slot) => {
                const active =
                  arrivalWindowStart === slot.start && arrivalWindowEnd === slot.end;
                return (
                  <button
                    key={slot.start}
                    type="button"
                    disabled={!slot.available}
                    aria-pressed={active}
                    onClick={() => onSelectWindow(slot)}
                    title={!slot.available ? t("booking.schedule.noCleanersAvailable", { defaultValue: "No cleaners available" }) : undefined}
                    className={cn(
                      SELECTABLE_OPTION_BASE,
                      "flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-3 text-center text-sm font-medium",
                      !slot.available && SELECTABLE_OPTION_DISABLED,
                      slot.available && active && SELECTABLE_OPTION_SELECTED,
                      slot.available && !active && SELECTABLE_OPTION_UNSELECTED
                    )}
                  >
                    <span>{slot.label}</span>
                    {!slot.available && (
                      <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">
                        {t("booking.schedule.noCleanersAvailable", { defaultValue: "No cleaners available" })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {!loadingSlots && !slotsError && slots && slots.length > 0 && !hasAnyAvailability && (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              {t("booking.schedule.noWindowsThisDay", {
                defaultValue: "No arrival windows are available on this date. Please pick another date.",
              })}
            </p>
          )}

          {!loadingSlots && !slotsError && slots && slots.length === 0 && (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              {t("booking.schedule.noWindowsThisDay", {
                defaultValue: "No arrival windows are available on this date. Please pick another date.",
              })}
            </p>
          )}
        </div>
      )}

      {scheduledAt && arrivalWindowStart && arrivalWindowEnd && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-seafoam-50 px-3 py-1 font-medium text-seafoam-700 dark:bg-slate-800">
            {new Date(scheduledAt).toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
            {" · "}
            {t("booking.schedule.arrivesBetween", {
              defaultValue: "Arrives between",
            })}{" "}
            {slots?.find((s) => s.start === arrivalWindowStart)?.label ??
              `${arrivalWindowStart} – ${arrivalWindowEnd}`}
          </span>
          {isEmergency && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              <Zap className="h-3 w-3" /> {t("booking.schedule.rushFeeApplied")}
            </span>
          )}
          {pickedDayInfo?.adjustmentLabel && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              {pickedDayInfo.adjustmentLabel}
            </span>
          )}
          {pickedDayInfo?.promoLabel && (
            <span className="inline-flex items-center rounded-full bg-seafoam-50 px-3 py-1 text-xs font-semibold text-seafoam-700 dark:bg-slate-800">
              {pickedDayInfo.promoLabel}
            </span>
          )}
        </div>
      )}

      {/* Subscription section */}
      <div className="mt-6 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <button
          type="button"
          role="switch"
          aria-checked={isSubscription}
          onClick={() => setSubscription(!isSubscription)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-seafoam-500" aria-hidden="true" />
            <span className="text-sm font-semibold text-charcoal dark:text-white">
              {t("booking.schedule.makeSubscription")}
            </span>
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors motion-reduce:transition-none",
              isSubscription ? "bg-seafoam-500" : "bg-slate-300 dark:bg-slate-600"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all motion-reduce:transition-none",
                isSubscription ? "left-5" : "left-0.5"
              )}
            />
          </span>
        </button>

        {/* Cadence picker, no per-visit pricing here; recurring savings are
            shown with the final total on the review step. */}
        {isSubscription && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {cadences.map((c) => {
              const active = subscriptionCadence === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSubscription(true, c.value)}
                  className={cn(
                    SELECTABLE_OPTION_BASE,
                    "rounded-xl p-3 text-center",
                    active ? SELECTABLE_OPTION_SELECTED : SELECTABLE_OPTION_UNSELECTED
                  )}
                >
                  <p className="text-sm font-semibold text-charcoal dark:text-white">
                    {c.label}
                  </p>
                  <p className="text-xs text-seafoam-700">
                    {t("booking.schedule.recurringDiscount", { defaultValue: "Save on every visit" })}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </StepShell>
  );
}
