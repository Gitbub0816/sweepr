import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, Repeat, Sparkles, Home as HomeIcon, Truck } from "lucide-react";
import { StatusBadge } from "@sweepr/ui";
import { formatCurrency, formatDateTime, SERVICE_LABELS } from "@sweepr/utils";
import { useBookings } from "../data/bookings";

const suggested = [
  { type: "standard" as const, icon: HomeIcon },
  { type: "deep" as const, icon: Sparkles },
  { type: "move_in_out" as const, icon: Truck },
  { type: "recurring" as const, icon: Repeat },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Home() {
  const { bookings } = useBookings();
  const upcoming = bookings.find((b) =>
    ["confirmed", "booked", "cleaner_on_the_way", "in_progress", "cleaner_accepted", "arrived"].includes(b.status)
  );
  const last = bookings[0];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-black text-charcoal dark:text-white">
        {greeting()}! 👋
      </h1>
      <p className="mt-1 text-slate-500">Ready for a spotless home?</p>

      {/* Upcoming booking */}
      {upcoming && (
        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="h-1.5 bg-seafoam-500" />
          <div className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-seafoam-600">
                Upcoming clean
              </p>
              <StatusBadge status={upcoming.status} />
            </div>
            <h2 className="mt-2 text-xl font-black text-charcoal dark:text-white">
              {SERVICE_LABELS[upcoming.serviceType]}
            </h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
              <CalendarClock className="h-4 w-4" />
              {formatDateTime(upcoming.scheduledFor)}
            </p>
            <Link
              to={`/bookings/${upcoming.id}`}
              className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-seafoam-600 hover:text-seafoam-700"
            >
              View details <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Quick rebook */}
      {last && (
        <div className="mt-4 flex items-center justify-between rounded-3xl border border-slate-200 bg-offwhite p-5 dark:border-slate-700 dark:bg-slate-900">
          <div>
            <p className="text-sm font-bold text-charcoal dark:text-white">
              Book again
            </p>
            <p className="text-sm text-slate-500">
              {SERVICE_LABELS[last.serviceType]} · {formatCurrency(last.quote.total)}
            </p>
          </div>
          <Link
            to="/book/address"
            className="rounded-2xl bg-seafoam-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-seafoam-600"
          >
            Rebook
          </Link>
        </div>
      )}

      {/* Suggested services */}
      <h2 className="mt-10 text-lg font-black text-charcoal dark:text-white">
        Book a cleaning
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {suggested.map((s) => (
          <Link
            key={s.type}
            to="/book/address"
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-seafoam-300 dark:border-slate-700 dark:bg-slate-900"
            style={{ borderLeft: "6px solid #14b8a6" }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
              <s.icon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="font-black text-charcoal dark:text-white">
                {SERVICE_LABELS[s.type]}
              </p>
              <p className="text-sm text-slate-500">Get an instant quote</p>
            </div>
            <ArrowRight className="h-5 w-5 text-slate-300" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Home;
