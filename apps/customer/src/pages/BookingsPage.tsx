import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight } from "lucide-react";
import {
  DashboardShell,
  Card,
  StatusBadge,
  Button,
  EmptyState,
} from "@sweepr/ui";
import {
  SERVICE_LABELS,
  formatDateTime,
  formatCurrency,
} from "@sweepr/utils";
import { mockBookings } from "../data/mock";

export function BookingsPage() {
  const upcoming = mockBookings.filter((b) =>
    new Date(b.scheduledFor) > new Date()
  );
  const past = mockBookings.filter(
    (b) => new Date(b.scheduledFor) <= new Date()
  );

  return (
    <DashboardShell
      title="My Bookings"
      description="Track upcoming cleanings and revisit past ones."
      actions={
        <Link to="/book/address">
          <Button>Book a cleaning</Button>
        </Link>
      }
    >
      <Section title="Upcoming" bookings={upcoming} />
      <Section title="Past" bookings={past} empty />
    </DashboardShell>
  );
}

function Section({
  title,
  bookings,
  empty,
}: {
  title: string;
  bookings: typeof mockBookings;
  empty?: boolean;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-500">{title}</h2>
      {bookings.length === 0 ? (
        empty ? null : (
          <EmptyState
            icon={<CalendarClock className="h-10 w-10" />}
            title="Nothing here yet"
            description="Your upcoming cleanings will appear here."
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
                  {SERVICE_LABELS[b.serviceType]}
                </p>
                <p className="text-sm text-slate-500">
                  {formatDateTime(b.scheduledFor)} · {b.address.city}
                </p>
              </div>
              <div className="text-right">
                <StatusBadge status={b.status} />
                <p className="mt-1 text-sm font-semibold text-charcoal dark:text-white">
                  {formatCurrency(b.quote.total)}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300" />
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
