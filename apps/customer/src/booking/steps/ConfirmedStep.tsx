import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, MapPin, CalendarClock, UserCheck, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "@sweepr/ui";
import { SERVICE_LABELS, formatDateTime } from "@sweepr/utils";
import { useAuth } from "@clerk/clerk-react";
import { useBookingStore } from "../../store/booking";
import { fetchBooking } from "../../data/bookings";
import type { Booking } from "@sweepr/types";

export function ConfirmedStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const state = useBookingStore();
  const { address, serviceType, scheduledFor, bookingId, reset } = state;
  const [dbBooking, setDbBooking] = useState<Booking | null>(null);

  // Load the real booking from the DB so we can show cleaner assignment status.
  useEffect(() => {
    if (!bookingId) return;
    fetchBooking(getToken, bookingId).then((b) => {
      if (b) setDbBooking(b);
    });
  }, [bookingId, getToken]);

  const cleanerAssigned = !!dbBooking?.cleanerId;

  return (
    <div className="min-h-screen bg-offwhite px-4 py-16 dark:bg-slate-950">
      <div className="mx-auto max-w-lg text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 14 }}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-seafoam-500 text-white"
        >
          <CheckCircle2 className="h-9 w-9" />
        </motion.div>
        <h1 className="mt-6 text-3xl font-bold text-charcoal dark:text-white">
          {t("booking.confirmed.title")}
        </h1>
        <p className="mt-2 text-slate-500">
          {cleanerAssigned
            ? t("booking.confirmed.cleanerAssigned")
            : t("booking.confirmed.findingCleaner")}
        </p>

        {/* Cleaner assignment status */}
        <div className={`mt-6 flex items-center justify-center gap-3 rounded-2xl px-5 py-4 ${
          cleanerAssigned
            ? "bg-seafoam-50 dark:bg-seafoam-900/20"
            : "bg-amber-50 dark:bg-amber-900/20"
        }`}>
          {cleanerAssigned ? (
            <>
              <UserCheck className="h-5 w-5 text-seafoam-600" />
              <span className="text-sm font-semibold text-seafoam-800 dark:text-seafoam-200">
                {t("booking.confirmed.cleanerAssignedBadge")}
              </span>
            </>
          ) : (
            <>
              <Clock className="h-5 w-5 text-amber-600 animate-pulse" />
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {t("booking.confirmed.matchingCleaner")}
              </span>
            </>
          )}
        </div>

        {(serviceType || dbBooking) && (scheduledFor || dbBooking) && (
          <Card className="mt-8 text-left">
            <p className="text-sm font-semibold text-charcoal dark:text-white">
              {SERVICE_LABELS[(dbBooking?.serviceType ?? serviceType)!]}
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
          <p className="mt-4 text-xs text-slate-400">
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
