/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarClock, Repeat, Home as HomeIcon, RotateCcw, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@sweepr/ui";
import { formatCurrency, formatDateTime } from "@sweepr/utils";
import { useBookings } from "../data/bookings";
import { useBookingStore } from "../store/booking";

const DRAFT_TTL_MS = 48 * 60 * 60 * 1000;

export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { bookings } = useBookings();
  const draft = useBookingStore();
  const setIntent = useBookingStore((s) => s.setIntent);

  // Start a booking with a chosen intent. Remember it so the choice persists as
  // the default for next time (customers who only ever do one kind skip the ask).
  function beginBooking(intent: "home" | "short_term_rental") {
    setIntent(intent);
    try {
      localStorage.setItem("sweepr-preferred-intent", intent);
    } catch {
      /* ignore storage errors */
    }
    navigate(intent === "home" ? "/book/address" : "/book/rental");
  }
  const hasDraft =
    !!draft.serviceType &&
    !draft.bookingId &&
    !!draft.draftSavedAt &&
    Date.now() - new Date(draft.draftSavedAt).getTime() < DRAFT_TTL_MS;

  const upcoming = bookings.find((b) =>
    ["confirmed", "booked", "cleaner_on_the_way", "in_progress", "cleaner_accepted", "arrived"].includes(b.status)
  );
  const last = bookings[0];

  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? "home.goodMorning" : hour < 18 ? "home.goodAfternoon" : "home.goodEvening";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-black text-charcoal dark:text-white">
        {t(greetingKey)}! 👋
      </h1>
      <p className="mt-1 text-slate-500">{t("home.readyForSpotless")}</p>

      {/* Resume in-progress booking draft */}
      {hasDraft && (
        <Link
          to="/book/service"
          className="mt-6 flex items-center gap-4 rounded-3xl border-2 border-seafoam-400 bg-seafoam-50 px-5 py-4 shadow-sm transition hover:bg-seafoam-100 dark:bg-seafoam-900/20 dark:border-seafoam-600 dark:hover:bg-seafoam-900/30"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-seafoam-700 text-white flex-shrink-0">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-seafoam-800 dark:text-seafoam-200">
              {t("home.pickUpWhereYouLeftOff")}
            </p>
            <p className="text-xs text-seafoam-700 dark:text-seafoam-400 truncate">
              {draft.intent === "short_term_rental"
                ? t("home.rentalCleaning", { defaultValue: "Rental turnover" })
                : t("home.homeCleaning", { defaultValue: "Home cleaning" })}{" "}
              · {t("home.savedDraft")}
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-seafoam-500 flex-shrink-0" />
        </Link>
      )}

      {/* Upcoming booking */}
      {upcoming && (
        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="h-1.5 bg-seafoam-500" />
          <div className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-seafoam-700">
                {t("home.upcomingClean")}
              </p>
              <StatusBadge status={upcoming.status} />
            </div>
            <h2 className="mt-2 text-xl font-black text-charcoal dark:text-white">
              {t(`serviceTypes.${upcoming.serviceType}`)}
            </h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
              <CalendarClock className="h-4 w-4" />
              {formatDateTime(upcoming.scheduledFor)}
            </p>
            <Link
              to={`/bookings/${upcoming.id}`}
              className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-seafoam-700 hover:text-seafoam-700"
            >
              {t("home.viewDetails")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Quick rebook */}
      {last && (
        <div className="mt-4 flex items-center justify-between rounded-3xl border border-slate-200 bg-offwhite p-5 dark:border-slate-700 dark:bg-slate-900">
          <div>
            <p className="text-sm font-bold text-charcoal dark:text-white">
              {t("home.bookAgain")}
            </p>
            <p className="text-sm text-slate-500">
              {t(`serviceTypes.${last.serviceType}`)} · {formatCurrency(last.quote.total)}
            </p>
          </div>
          <Link
            to="/book/address"
            className="rounded-2xl bg-seafoam-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-seafoam-800"
          >
            {t("home.rebook")}
          </Link>
        </div>
      )}

      {/* Get a cleaning — two entry paths (no service types up front) */}
      <h2 className="mt-10 text-lg font-black text-charcoal dark:text-white">
        {t("home.getACleaning", { defaultValue: "Get a cleaning" })}
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <GetCleaningCard
          icon={HomeIcon}
          title={t("home.needHomeCleaned", { defaultValue: "I need my home cleaned" })}
          onClick={() => beginBooking("home")}
        />
        <GetCleaningCard
          icon={KeyRound}
          title={t("home.needRentalCleaned", { defaultValue: "I need my short-term rental cleaned" })}
          onClick={() => beginBooking("short_term_rental")}
        />
      </div>
    </div>
  );
}

function GetCleaningCard({
  icon: Icon,
  title,
  onClick,
}: {
  icon: typeof HomeIcon;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-seafoam-300 dark:border-slate-700 dark:bg-slate-900"
      style={{ borderLeft: "6px solid #14b8a6" }}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-seafoam-50 text-seafoam-700 dark:bg-slate-800">
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <p className="font-black text-charcoal dark:text-white">{title}</p>
      </div>
      <ArrowRight className="h-5 w-5 text-slate-300" />
    </button>
  );
}

export default Home;
