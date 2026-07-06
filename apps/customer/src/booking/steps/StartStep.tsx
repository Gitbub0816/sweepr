import { useNavigate } from "react-router-dom";
import { Home, CalendarClock, ArrowRight } from "lucide-react";
import { useBookingStore } from "../../store/booking";

/**
 * Booking entry split. Two paths:
 *   - "I need my home cleaned"  → normal room-condition flow.
 *   - "I have a short-term rental" → calendar-synced turnaround service.
 */
export function StartStep() {
  const navigate = useNavigate();
  const setIntent = useBookingStore((s) => s.setIntent);

  return (
    <div>
      <h1 className="text-2xl font-bold text-charcoal dark:text-white">
        What can we clean for you?
      </h1>
      <p className="mt-1 text-sm text-slate-500">Choose the option that fits best.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setIntent("home");
            navigate("/book/address");
          }}
          className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 text-left transition-all hover:border-seafoam-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-seafoam-100 text-seafoam-700 dark:bg-seafoam-900/30">
            <Home className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-charcoal dark:text-white">
            I need my home cleaned
          </h2>
          <p className="mt-1 flex-1 text-sm text-slate-500">
            A one-time or recurring clean for the place you live.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-seafoam-700 dark:text-seafoam-300">
            Get started <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIntent("short_term_rental");
            navigate("/book/rental");
          }}
          className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 text-left transition-all hover:border-seafoam-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/30">
            <CalendarClock className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-charcoal dark:text-white">
            I need my short-term rental cleaned
          </h2>
          <p className="mt-1 flex-1 text-sm text-slate-500">
            Like Airbnb or Vrbo. Sync your calendar and we'll turn it over between guests.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-seafoam-700 dark:text-seafoam-300">
            Set up turnovers <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
      </div>
    </div>
  );
}
