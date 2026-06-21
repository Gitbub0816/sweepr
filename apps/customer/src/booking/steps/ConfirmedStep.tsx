import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, MapPin, CalendarClock } from "lucide-react";
import { Button, Card } from "@sweepr/ui";
import {
  SERVICE_LABELS,
  formatDateTime,
  TRACKING_STEPS,
  JOB_STATUS_LABELS,
} from "@sweepr/utils";
import { useBookingStore } from "../../store/booking";

export function ConfirmedStep() {
  const navigate = useNavigate();
  const state = useBookingStore();
  const { address, serviceType, scheduledFor, reset } = state;

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
          You're booked!
        </h1>
        <p className="mt-2 text-slate-500">
          We're matching you with a trusted cleaner. You'll get updates as your
          appointment approaches.
        </p>

        {serviceType && scheduledFor && (
          <Card className="mt-8 text-left">
            <p className="text-sm font-semibold text-charcoal dark:text-white">
              {SERVICE_LABELS[serviceType]}
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-500">
              <p className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-seafoam-500" />
                {formatDateTime(scheduledFor)}
              </p>
              {address && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-seafoam-500" />
                  {address.line1}, {address.city}
                </p>
              )}
            </div>

            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">
                Tracking preview
              </p>
              <ol className="space-y-2">
                {TRACKING_STEPS.map((s, i) => (
                  <li key={s} className="flex items-center gap-3 text-sm">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                        i === 0
                          ? "bg-seafoam-500 text-white"
                          : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={
                        i === 0
                          ? "font-medium text-charcoal dark:text-white"
                          : "text-slate-400"
                      }
                    >
                      {JOB_STATUS_LABELS[s]}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        )}

        <div className="mt-8 flex justify-center gap-3">
          <Button
            onClick={() => {
              reset();
              navigate("/bookings");
            }}
          >
            View my bookings
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              navigate("/book/address");
            }}
          >
            Book another
          </Button>
        </div>
      </div>
    </div>
  );
}
