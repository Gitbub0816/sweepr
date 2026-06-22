import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ThemeToggle, PriceSummary, SweeprLogo, track, Events } from "@sweepr/ui";
import { useBookingStore } from "../store/booking";
import { BOOKING_STEPS, stepIndex } from "./steps";
import { calculateQuote } from "@sweepr/utils";

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
  const serviceType = useBookingStore((s) => s.serviceType);
  const home = useBookingStore((s) => s.home);
  const addOnKeys = useBookingStore((s) => s.addOnKeys);
  const quote = serviceType ? calculateQuote({ serviceType, home, addOnKeys }) : null;
  const isRebook = useBookingStore((s) => s.isRebook);
  const rebookedFromDate = useBookingStore((s) => s.rebookedFromDate);

  return (
    <div className="min-h-screen bg-offwhite dark:bg-slate-950">
      {/* Sticky progress bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <a href="/" className="flex items-center gap-2" aria-label="Sweepr home">
            <SweeprLogo size="md" />
          </a>
          <div className="flex-1">
            <p className="text-xs font-medium text-slate-500">
              Step {idx + 1} of {BOOKING_STEPS.length}
            </p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <motion.div
                className="h-full rounded-full bg-seafoam-500"
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

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>

        <aside className="hidden lg:block">
          {quote ? (
            <PriceSummary quote={quote} />
          ) : (
            <div className="sticky top-24 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
              Your price will appear here once you pick a service.
            </div>
          )}
        </aside>
      </div>

      {/* Mobile price bar */}
      {quote && (
        <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 lg:hidden">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Estimated total</span>
            <span className="text-lg font-bold text-charcoal dark:text-white">
              ${quote.total.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
