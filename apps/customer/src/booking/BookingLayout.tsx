/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { MapPin, Home as HomeIcon, Sparkles, CalendarClock } from "lucide-react";
import { ThemeToggle, SweeprLogo, track, Events } from "@sweepr/ui";
import { useBookingStore } from "../store/booking";
import { BOOKING_STEPS, stepIndex } from "./steps";

export function BookingLayout() {
  const location = useLocation();
  const idx = stepIndex(location.pathname);
  const prevIdx = useRef(-1);

  useEffect(() => {
    track(Events.BOOKING_STARTED);
  }, []);

  useEffect(() => {
    // Fire a step-completed event when advancing forward through the funnel.
    if (idx > prevIdx.current && prevIdx.current >= 0) {
      track(Events.BOOKING_STEP_COMPLETED, {
        step: BOOKING_STEPS[prevIdx.current]?.label ?? prevIdx.current,
        stepIndex: prevIdx.current,
      });
    }
    prevIdx.current = idx;
  }, [idx]);
  const isRebook = useBookingStore((s) => s.isRebook);
  const rebookedFromDate = useBookingStore((s) => s.rebookedFromDate);

  return (
    <div className="min-h-screen bg-offwhite dark:bg-slate-950">
      {/* Sticky progress bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <a href="/" className="flex items-center gap-2" aria-label="Sweepr home">
            <SweeprLogo size="lg" />
          </a>
          <div className="flex-1">
            <p className="text-xs font-medium text-slate-500" role="status" aria-live="polite">
              Step {idx + 1} of {BOOKING_STEPS.length}
              <span className="sr-only">: {BOOKING_STEPS[idx]?.label}</span>
            </p>
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
              role="progressbar"
              aria-valuenow={idx + 1}
              aria-valuemin={1}
              aria-valuemax={BOOKING_STEPS.length}
              aria-label="Booking progress"
            >
              <motion.div
                className="h-full rounded-full bg-seafoam-500 motion-reduce:transition-none"
                animate={{
                  width: `${((idx + 1) / BOOKING_STEPS.length) * 100}%`,
                }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {isRebook && (
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <span className="inline-flex items-center rounded-full bg-seafoam-100 px-3 py-1 text-xs font-medium text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300">
            Rebooked from{" "}
            {rebookedFromDate
              ? new Date(rebookedFromDate).toLocaleDateString()
              : "a previous clean"}
          </span>
        </div>
      )}

      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="motion-reduce:transition-none"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Booking recap, deliberately NO pricing here. The customer sees the
            final owed amount only on the Review step. */}
        <aside className="hidden lg:block">
          <BookingRecap />
        </aside>
      </main>
    </div>
  );
}

function BookingRecap() {
  const address = useBookingStore((s) => s.address);
  const home = useBookingStore((s) => s.home);
  const rooms = useBookingStore((s) => s.rooms);
  const scheduledFor = useBookingStore((s) => s.scheduledFor);
  const arrivalWindowStart = useBookingStore((s) => s.arrivalWindowStart);
  const arrivalWindowEnd = useBookingStore((s) => s.arrivalWindowEnd);

  const items: Array<{ icon: typeof MapPin; label: string; value: string }> = [];
  if (address) {
    items.push({
      icon: MapPin,
      label: "Address",
      value: [address.line1, address.city].filter(Boolean).join(", "),
    });
  }
  items.push({
    icon: HomeIcon,
    label: "Home",
    value: `${home.bedrooms} bd · ${home.bathrooms} ba · ${home.sqft} sqft`,
  });
  if (rooms.length > 0) {
    items.push({
      icon: Sparkles,
      label: "Rooms assessed",
      value: `${rooms.length} of 4`,
    });
  }
  if (scheduledFor) {
    const when = new Date(scheduledFor).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    items.push({
      icon: CalendarClock,
      label: "Scheduled",
      value:
        arrivalWindowStart && arrivalWindowEnd
          ? `${when}, ${arrivalWindowStart}–${arrivalWindowEnd}`
          : when,
    });
  }

  return (
    <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm font-semibold text-charcoal dark:text-white">Your booking</p>
      <div className="mt-3 space-y-3">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-700 dark:bg-slate-800">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="truncate text-sm font-medium text-charcoal dark:text-white">{value}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-400">
        You'll see your total on the review step, one simple price, everything included.
      </p>
    </div>
  );
}
