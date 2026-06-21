import { useState } from "react";
import {
  DashboardShell,
  Button,
  toast,
  SweeprCalendar,
  AddSlotModal,
  type CalendarSlot,
} from "@sweepr/ui";
import { Zap } from "lucide-react";
import { cn } from "@sweepr/utils";

// Day-of-week helper: build the next date matching a weekday for display.
function nextDateForDay(dow: number): Date {
  const d = new Date();
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return d;
}

const initialSlots: CalendarSlot[] = [
  {
    id: "r-mon",
    date: nextDateForDay(1),
    startTime: "08:00",
    endTime: "16:00",
    type: "recurring",
  },
  {
    id: "r-wed",
    date: nextDateForDay(3),
    startTime: "08:00",
    endTime: "16:00",
    type: "recurring",
  },
  {
    id: "b-1",
    date: nextDateForDay(5),
    startTime: "10:00",
    endTime: "13:00",
    type: "booked",
    label: "Deep clean — confirmed",
  },
];

export function SchedulePage() {
  const [slots, setSlots] = useState<CalendarSlot[]>(initialSlots);
  const [availableNow, setAvailableNow] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const toggleAvailableNow = () => {
    const next = !availableNow;
    setAvailableNow(next);
    // POST /schedule/available-now { available: next }
    toast.success(
      next ? "You're available now — accepting same-day jobs" : "Available Now off"
    );
  };

  const handleDelete = (id: string) => {
    setSlots((s) => s.filter((x) => x.id !== id));
    toast.success("Slot removed");
  };

  return (
    <DashboardShell
      title="Availability"
      description="Set when you're available so we can match you with jobs."
      actions={<Button onClick={() => setModalOpen(true)}>Add Availability</Button>}
    >
      <button
        onClick={toggleAvailableNow}
        className={cn(
          "mb-5 flex w-full items-center justify-between rounded-2xl border p-5 text-left transition-all",
          availableNow
            ? "animate-pulse border-amber-400 bg-amber-50 dark:bg-amber-900/20"
            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl",
              availableNow
                ? "bg-amber-400 text-amber-950"
                : "bg-slate-100 text-slate-400 dark:bg-slate-800"
            )}
          >
            <Zap className="h-6 w-6" />
          </span>
          <div>
            <p className="text-base font-bold text-charcoal dark:text-white">
              {availableNow ? "You're Available Now" : "Available Now"}
            </p>
            <p className="text-sm text-slate-500">
              {availableNow
                ? "Accepting same-day jobs"
                : "Tap to accept immediate, same-day bookings"}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "relative h-7 w-12 rounded-full transition-colors",
            availableNow ? "bg-amber-400" : "bg-slate-300 dark:bg-slate-600"
          )}
        >
          <span
            className={cn(
              "absolute top-1 h-5 w-5 rounded-full bg-white transition-all",
              availableNow ? "left-6" : "left-1"
            )}
          />
        </span>
      </button>

      <SweeprCalendar
        mode="cleaner-availability"
        slots={slots}
        onSlotCreate={(date, startTime, endTime) => {
          setSlots((s) => [
            ...s,
            {
              id: crypto.randomUUID(),
              date,
              startTime,
              endTime,
              type: "flexible",
            },
          ]);
          toast.success("Slot added");
        }}
        onSlotDelete={handleDelete}
      />

      <AddSlotModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreate={({ type, daysOfWeek, startTime, endTime, date }) => {
          if (type === "available_now") {
            setAvailableNow(true);
            toast.success("You're available now");
            return;
          }
          const newSlots: CalendarSlot[] =
            type === "recurring"
              ? daysOfWeek.map((dow) => ({
                  id: crypto.randomUUID(),
                  date: nextDateForDay(dow),
                  startTime,
                  endTime,
                  type: "recurring" as const,
                }))
              : [
                  {
                    id: crypto.randomUUID(),
                    date: date ?? new Date(),
                    startTime,
                    endTime,
                    type: "flexible" as const,
                  },
                ];
          setSlots((s) => [...s, ...newSlots]);
          toast.success("Availability saved");
        }}
      />
    </DashboardShell>
  );
}
