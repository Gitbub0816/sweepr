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
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, MapPin, CalendarClock, UserCheck, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";
import { Button, Card } from "@sweepr/ui";
import { formatDateTime } from "@sweepr/utils";
import { useAuth } from "@clerk/clerk-react";
import { useAppToken } from "@/lib/appToken";
import { useBookingStore } from "../../store/booking";
import { fetchBooking, fetchCrew, isTeamBooking, assignedSeats, type BookingCrew } from "../../data/bookings";
import { CrewTeamCard } from "../../components/CrewTeamCard";
import type { Booking } from "@sweepr/types";

export function ConfirmedStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getToken } = useAppToken();
  const state = useBookingStore();
  const { address, serviceType, scheduledFor, bookingId, reset } = state;
  const [dbBooking, setDbBooking] = useState<Booking | null>(null);
  const [crew, setCrew] = useState<BookingCrew | null>(null);

  // Load the real booking from the DB so we can show cleaner assignment status.
  useEffect(() => {
    if (!bookingId) return;
    fetchBooking(getToken, bookingId).then((b) => {
      if (b) setDbBooking(b);
    });
    fetchCrew(getToken, bookingId).then((c) => setCrew(c));
  }, [bookingId, getToken]);

  const cleanerAssigned = !!dbBooking?.cleanerId;
  const teamBooking = isTeamBooking(crew);
  const hasTeamSeats = assignedSeats(crew).length > 0;

  return (
    <div className="min-h-screen bg-offwhite px-4 py-16 dark:bg-slate-950">
      <div className="mx-auto max-w-lg text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 14 }}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-seafoam-700 text-white"
        >
          <CheckCircle2 className="h-9 w-9" />
        </motion.div>
        <h1 className="mt-6 text-3xl font-bold text-charcoal dark:text-white">
          {t("booking.confirmed.title")}
        </h1>
        <p className="mt-2 text-slate-500">
          {teamBooking
            ? t("booking.confirmed.teamConfirming", {
                defaultValue: "Your Sweepr team is being confirmed.",
              })
            : cleanerAssigned
              ? t("booking.confirmed.cleanerAssigned")
              : t("booking.confirmed.findingCleaner")}
        </p>

        {/* Cleaner assignment status */}
        <div className={`mt-6 flex items-center justify-center gap-3 overflow-hidden rounded-2xl px-5 py-4 ${
          teamBooking || cleanerAssigned
            ? "bg-seafoam-50 dark:bg-seafoam-900/20"
            : "bg-amber-50 dark:bg-amber-900/20"
        }`}>
          <AnimatePresence mode="wait">
            {teamBooking ? (
              <motion.div
                key="team"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-3 motion-reduce:transition-none"
              >
                <Users className="h-5 w-5 text-seafoam-700" />
                <span className="text-sm font-semibold text-seafoam-800 dark:text-seafoam-200">
                  {t("booking.confirmed.teamBadge", { defaultValue: "Building your team" })}
                </span>
              </motion.div>
            ) : cleanerAssigned ? (
              <motion.div
                key="assigned"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-3 motion-reduce:transition-none"
              >
                <UserCheck className="h-5 w-5 text-seafoam-700" />
                <span className="text-sm font-semibold text-seafoam-800 dark:text-seafoam-200">
                  {t("booking.confirmed.cleanerAssignedBadge")}
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="matching"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-3 motion-reduce:transition-none"
              >
                <Clock className="h-5 w-5 text-amber-600 animate-pulse" />
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  {t("booking.confirmed.matchingCleaner")}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {teamBooking && hasTeamSeats && crew && (
          <div className="mt-6 text-left">
            <CrewTeamCard crew={crew} />
          </div>
        )}

        {(serviceType || dbBooking) && (scheduledFor || dbBooking) && (
          <Card className="mt-8 text-left">
            <p className="text-sm font-semibold text-charcoal dark:text-white">
              {t(`serviceTypes.${dbBooking?.serviceType ?? serviceType ?? "standard"}`)}
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-500">
              <p className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-seafoam-500" />
                {formatDateTime((dbBooking?.scheduledFor ?? scheduledFor)!)}
              </p>
              {(dbBooking?.address?.line1 ?? address) && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-seafoam-500" />
                  {dbBooking?.address?.line1 ?? address?.line1},{" "}
                  {dbBooking?.address?.city ?? address?.city}
                </p>
              )}
            </div>
          </Card>
        )}

        {bookingId && (
          <p className="mt-4 text-xs text-slate-600">
            {t("booking.confirmed.bookingRef")} <span className="font-mono">{bookingId.slice(0, 8).toUpperCase()}</span>
          </p>
        )}

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button onClick={() => { reset(); navigate("/"); }}>
            {t("booking.confirmed.goToDashboard")}
          </Button>
          {bookingId ? (
            <Link to={`/bookings/${bookingId}`}>
              <Button variant="secondary" onClick={reset}>{t("booking.confirmed.viewBookingDetails")}</Button>
            </Link>
          ) : (
            <Button variant="secondary" onClick={() => { reset(); navigate("/bookings"); }}>
              {t("booking.confirmed.viewMyBookings")}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              navigate("/book/address");
            }}
          >
            {t("booking.confirmed.bookAnother")}
          </Button>
        </div>
      </div>
    </div>
  );
}
