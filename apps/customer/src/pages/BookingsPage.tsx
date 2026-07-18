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
import { CalendarClock, ChevronRight, RotateCcw, Sparkles } from "lucide-react";
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

  const emptyIcon = <Sparkles className="h-12 w-12 text-seafoam-500" aria-hidden="true" />;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-500">{title}</h2>
      {bookings.length === 0 ? (
        empty ? null : (
          <EmptyState
            icon={emptyIcon}
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
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-seafoam-50 text-seafoam-700 dark:bg-slate-800">
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
                    // Room conditions aren't carried over — send the customer
                    // back through the rooms step to reassess (and reprice).
                    navigate("/book/rooms");
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
