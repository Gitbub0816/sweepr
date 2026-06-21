import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";
import { cn } from "@sweepr/utils";

const TIME_SLOTS = ["08:00", "10:00", "12:00", "14:00", "16:00"];

function fmtSlot(t: string) {
  const [h] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${ampm}`;
}

export function ScheduleStep() {
  const navigate = useNavigate();
  const scheduledFor = useBookingStore((s) => s.scheduledFor);
  const setSchedule = useBookingStore((s) => s.setSchedule);

  const days = useMemo(() => {
    return Array.from({ length: 14 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i + 1);
      d.setHours(0, 0, 0, 0);
      return d;
    });
  }, []);

  const selected = scheduledFor ? new Date(scheduledFor) : null;
  const [activeDay, setActiveDay] = useState<Date>(
    selected ?? days[0]
  );

  const selectSlot = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    const d = new Date(activeDay);
    d.setHours(h, m, 0, 0);
    setSchedule(d.toISOString());
  };

  return (
    <StepShell
      title="Pick a date & time"
      subtitle="Choose when you'd like your cleaner to arrive."
      onBack={() => navigate("/book/service")}
      onNext={() => navigate("/book/review")}
      nextDisabled={!scheduledFor}
    >
      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => {
          const isActive =
            d.toDateString() === activeDay.toDateString();
          return (
            <button
              key={d.toISOString()}
              onClick={() => setActiveDay(d)}
              className={cn(
                "flex min-w-[64px] flex-col items-center rounded-xl border px-3 py-2 text-sm transition-colors",
                isActive
                  ? "border-seafoam-400 bg-seafoam-50 text-seafoam-700 dark:bg-seafoam-900/20"
                  : "border-slate-200 text-slate-500 hover:border-seafoam-300 dark:border-slate-700"
              )}
            >
              <span className="text-xs">
                {d.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span className="text-lg font-bold">{d.getDate()}</span>
              <span className="text-[10px]">
                {d.toLocaleDateString("en-US", { month: "short" })}
              </span>
            </button>
          );
        })}
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold text-charcoal dark:text-white">
        Available times
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TIME_SLOTS.map((t) => {
          const slotDate = new Date(activeDay);
          const [h] = t.split(":").map(Number);
          slotDate.setHours(h, 0, 0, 0);
          const isActive =
            selected?.getTime() === slotDate.getTime();
          return (
            <button
              key={t}
              onClick={() => selectSlot(t)}
              className={cn(
                "rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "border-seafoam-400 bg-seafoam-500 text-white"
                  : "border-slate-200 text-charcoal hover:border-seafoam-300 dark:border-slate-700 dark:text-white"
              )}
            >
              {fmtSlot(t)}
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}
