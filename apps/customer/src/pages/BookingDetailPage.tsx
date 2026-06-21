import { useParams, Link } from "react-router-dom";
import { MapPin, CalendarClock } from "lucide-react";
import {
  DashboardShell,
  Card,
  StatusBadge,
  PriceSummary,
  ErrorState,
  Button,
} from "@sweepr/ui";
import {
  SERVICE_LABELS,
  formatDateTime,
  getAddOn,
  TRACKING_STEPS,
  JOB_STATUS_LABELS,
} from "@sweepr/utils";
import { mockBookings } from "../data/mock";

export function BookingDetailPage() {
  const { id } = useParams();
  const booking = mockBookings.find((b) => b.id === id);

  if (!booking) {
    return (
      <ErrorState
        title="Booking not found"
        description="We couldn't find that booking."
        action={
          <Link to="/bookings">
            <Button variant="secondary">Back to bookings</Button>
          </Link>
        }
      />
    );
  }

  const currentIdx = TRACKING_STEPS.indexOf(booking.status);

  return (
    <DashboardShell
      title={SERVICE_LABELS[booking.serviceType]}
      description={`Booking ${booking.id}`}
      actions={<StatusBadge status={booking.status} />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-sm font-semibold text-charcoal dark:text-white">
              Status tracker
            </h2>
            <ol className="mt-4 space-y-4">
              {TRACKING_STEPS.map((s, i) => {
                const done = currentIdx >= 0 && i <= currentIdx;
                return (
                  <li key={s} className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                        done
                          ? "bg-seafoam-500 text-white"
                          : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={
                        done
                          ? "text-sm font-medium text-charcoal dark:text-white"
                          : "text-sm text-slate-400"
                      }
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
                Add-ons:{" "}
                {booking.addOnKeys.map((k) => getAddOn(k)?.name).join(", ")}
              </p>
            )}
          </Card>
        </div>

        <PriceSummary quote={booking.quote} />
      </div>
    </DashboardShell>
  );
}
