import { Link, useNavigate } from "react-router-dom";
import { CalendarClock, ChevronRight, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DashboardShell,
  Card,
  StatusBadge,
  Button,
  EmptyState,
} from "@sweepr/ui";
import {
  formatDateTime,
  formatCurrency,
} from "@sweepr/utils";
import type { Booking } from "@sweepr/types";
import { useBookings } from "../data/bookings";
import { useBookingStore } from "../store/booking";

export function BookingsPage() {
  const { t } = useTranslation();
  const { bookings, loading } = useBookings();
  const upcoming = bookings.filter((b) => new Date(b.scheduledFor) > new Date());
  const past = bookings.filter((b) => new Date(b.scheduledFor) <= new Date());

  return (
    <DashboardShell
      title={t("bookings.title")}
      description={t("bookings.description")}
      actions={
        <Link to="/book/address">
          <Button>{t("bookings.bookACleaning")}</Button>
        </Link>
      }
    >
      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : (
        <>
          <Section title={t("bookings.upcoming")} bookings={upcoming} />
          <Section title={t("bookings.past")} bookings={past} empty showRebook />
        </>
      )}
    </DashboardShell>
  );
}

function Section({
  title,
  bookings,
  empty,
  showRebook,
}: {
  title: string;
  bookings: Booking[];
  empty?: boolean;
  showRebook?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const rebookFrom = useBookingStore((s) => s.rebookFrom);

  const broom = (
    <svg
      viewBox="0 0 24 24"
      className="h-12 w-12 text-seafoam-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19.4 4.6 14 10" />
      <path d="M11 9 4 16c-1.2 1.2-1.2 3 0 4.2 1.2 1.2 3 1.2 4.2 0L15 13" />
      <path d="m9 19 6-6" />
    </svg>
  );

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-500">{title}</h2>
      {bookings.length === 0 ? (
        empty ? null : (
          <EmptyState
            icon={broom}
            title={t("bookings.noBookingsTitle")}
            description={t("bookings.noBookingsDesc")}
            action={
              <Link to="/book/address">
                <Button>{t("bookings.bookFirstClean")}</Button>
              </Link>
            }
          />
        )
      ) : (
        bookings.map((b) => (
          <Link key={b.id} to={`/bookings/${b.id}`}>
            <Card className="flex items-center gap-4 transition-colors hover:border-seafoam-300">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-charcoal dark:text-white">
                  {t(`serviceTypes.${b.serviceType}`)}
                </p>
                <p className="text-sm text-slate-500">
                  {formatDateTime(b.scheduledFor)}{b.address?.city ? ` · ${b.address.city}` : ""}
                </p>
              </div>
              <div className="text-right">
                <StatusBadge status={b.status} />
                <p className="mt-1 text-sm font-semibold text-charcoal dark:text-white">
                  {b.quote ? formatCurrency(b.quote.total) : ""}
                </p>
              </div>
              {showRebook ? (
                <Button
                  variant="secondary"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    rebookFrom(b);
                    navigate("/book/schedule");
                  }}
                >
                  <RotateCcw className="mr-1 h-4 w-4" />
                  {t("bookings.rebook")}
                </Button>
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-300" />
              )}
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
