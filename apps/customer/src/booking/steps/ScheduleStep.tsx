import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Repeat } from "lucide-react";
import { SweeprCalendar, type CalendarSlot } from "@sweepr/ui";
import { cn } from "@sweepr/utils";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";

const WINDOW_HOURS: Record<string, number> = {
  morning: 9,
  afternoon: 13,
  evening: 17,
};

// Mock availability: next 21 days have morning/afternoon/evening windows.
function buildAvailability(): Record<string, CalendarSlot[]> {
  const data: Record<string, CalendarSlot[]> = {};
  for (let i = 1; i <= 21; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    data[key] = [
      { id: `${key}-m`, date: d, startTime: "08:00", endTime: "12:00", type: "flexible" },
      { id: `${key}-a`, date: d, startTime: "12:00", endTime: "16:00", type: "flexible" },
      { id: `${key}-e`, date: d, startTime: "16:00", endTime: "20:00", type: "flexible" },
    ];
  }
  return data;
}

const CADENCES = [
  { value: "weekly", label: "Weekly", discount: 10 },
  { value: "biweekly", label: "Biweekly", discount: 8 },
  { value: "monthly", label: "Monthly", discount: 5 },
] as const;

export function ScheduleStep() {
  const navigate = useNavigate();
  const {
    scheduledAt,
    timeWindow,
    isEmergency,
    isSubscription,
    subscriptionCadence,
    setSchedule,
    setTimeWindow,
    setSubscription,
    getQuote,
  } = useBookingStore();

  const availability = useMemo(buildAvailability, []);
  const [pickedDate, setPickedDate] = useState<Date | null>(
    scheduledAt ? new Date(scheduledAt) : null
  );

  const quote = getQuote();
  const baseTotal = quote?.total ?? 0;

  const onSelect = (slot: CalendarSlot) => {
    const window =
      slot.startTime === "08:00"
        ? "morning"
        : slot.startTime === "12:00"
          ? "afternoon"
          : "evening";
    const d = new Date(slot.date);
    d.setHours(WINDOW_HOURS[window], 0, 0, 0);
    setSchedule(d.toISOString());
    setTimeWindow(window as "morning" | "afternoon" | "evening");
    setPickedDate(d);
  };

  return (
    <StepShell
      title="Pick a date & time"
      subtitle="Choose a day, then a time window that works for you."
      onBack={() => navigate("/book/service")}
      onNext={() => navigate("/book/review")}
      nextDisabled={!scheduledAt || !timeWindow}
    >
      <SweeprCalendar
        mode="customer-booking"
        availabilityData={availability}
        selectedDate={pickedDate ?? undefined}
        onDateChange={setPickedDate}
        onSlotSelect={onSelect}
      />

      {scheduledAt && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-seafoam-50 px-3 py-1 font-medium text-seafoam-700 dark:bg-slate-800">
            {new Date(scheduledAt).toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
            {timeWindow ? ` · ${timeWindow}` : ""}
          </span>
          {isEmergency && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              <Zap className="h-3 w-3" /> Rush Fee Applied (+15%)
            </span>
          )}
        </div>
      )}

      {/* Subscription section */}
      <div className="mt-6 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <button
          onClick={() => setSubscription(!isSubscription)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-seafoam-500" />
            <span className="text-sm font-semibold text-charcoal dark:text-white">
              Make this a subscription
            </span>
          </span>
          <span
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors",
              isSubscription ? "bg-seafoam-500" : "bg-slate-300 dark:bg-slate-600"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                isSubscription ? "left-5" : "left-0.5"
              )}
            />
          </span>
        </button>

        {isSubscription && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {CADENCES.map((c) => {
              const price = Math.round(baseTotal * (1 - c.discount / 100));
              const savings = Math.round(baseTotal - price);
              const active = subscriptionCadence === c.value;
              return (
                <button
                  key={c.value}
                  onClick={() => setSubscription(true, c.value)}
                  className={cn(
                    "rounded-xl border p-3 text-center transition-colors",
                    active
                      ? "border-seafoam-400 bg-seafoam-50 dark:bg-seafoam-900/20"
                      : "border-slate-200 hover:border-seafoam-300 dark:border-slate-700"
                  )}
                >
                  <p className="text-sm font-semibold text-charcoal dark:text-white">
                    {c.label}
                  </p>
                  <p className="text-xs text-seafoam-600">${price}/visit</p>
                  {savings > 0 && (
                    <p className="mt-1 text-[10px] font-medium text-amber-600">
                      Save ${savings}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </StepShell>
  );
}
