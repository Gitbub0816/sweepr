import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Zap } from "lucide-react";
import { Button } from "../primitives/Button";
import { SlotChip } from "./SlotChip";
import type { CalendarProps, CalendarSlot } from "./types";
import { SLOT_COLORS, SLOT_LABELS } from "./types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8am–8pm

function keyOf(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function slotsForDate(
  date: Date,
  slots: CalendarSlot[],
  availabilityData?: Record<string, CalendarSlot[]>
): CalendarSlot[] {
  const fromData = availabilityData?.[keyOf(date)] ?? [];
  const fromSlots = slots.filter((s) => isSameDay(s.date, date));
  return [...fromData, ...fromSlots];
}

export function SweeprCalendar(props: CalendarProps) {
  const {
    mode,
    slots = [],
    onSlotCreate,
    onSlotDelete,
    onSlotSelect,
    selectedDate,
    onDateChange,
    availabilityData,
    isLoading,
  } = props;

  const [cursor, setCursor] = useState<Date>(selectedDate ?? new Date());
  const [view, setView] = useState<"month" | "week">("month");
  const [panelDate, setPanelDate] = useState<Date | null>(null);
  const [dir, setDir] = useState(0);

  const today = startOfDay(new Date());

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return eachDayOfInterval({ start, end: endOfWeek(start) });
  }, [cursor]);

  const go = (delta: number) => {
    setDir(delta);
    if (view === "month") {
      setCursor((c) => (delta > 0 ? addMonths(c, 1) : subMonths(c, 1)));
    } else {
      setCursor((c) => (delta > 0 ? addWeeks(c, 1) : subWeeks(c, 1)));
    }
  };

  const pickDay = (d: Date) => {
    setPanelDate(d);
    onDateChange?.(d);
  };

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => go(-1)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Previous"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="min-w-[180px] text-center text-lg font-bold text-charcoal dark:text-white">
            {format(cursor, view === "month" ? "MMMM yyyy" : "MMM d, yyyy")}
          </h2>
          <button
            onClick={() => go(1)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Next"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  view === v
                    ? "bg-seafoam-500 text-white"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-7 gap-1 p-4">
          {Array.from({ length: 35 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
            />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={`${view}-${keyOf(cursor)}`}
            custom={dir}
            initial={{ opacity: 0, x: dir > 0 ? 40 : -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir > 0 ? -40 : 40 }}
            transition={{ duration: 0.2 }}
          >
            {view === "month" ? (
              <div className="p-3">
                <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
                  {WEEKDAYS.map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {monthDays.map((day) => {
                    const inMonth = isSameMonth(day, cursor);
                    const past = isBefore(day, today);
                    const daySlots = slotsForDate(
                      day,
                      slots,
                      availabilityData
                    );
                    const hasAvail = daySlots.length > 0;
                    return (
                      <button
                        key={keyOf(day)}
                        onClick={() => pickDay(day)}
                        className={`flex min-h-[76px] flex-col items-start rounded-lg border p-1.5 text-left transition-colors ${
                          isToday(day)
                            ? "border-seafoam-400 bg-seafoam-50 dark:bg-seafoam-900/20"
                            : "border-slate-100 hover:border-seafoam-300 dark:border-slate-800"
                        } ${past ? "opacity-40" : ""} ${
                          !inMonth ? "opacity-30" : ""
                        }`}
                      >
                        <span className="text-xs font-semibold text-charcoal dark:text-white">
                          {format(day, "d")}
                        </span>
                        <div className="mt-1 flex w-full flex-col gap-0.5 overflow-hidden">
                          {mode === "customer-booking" ? (
                            hasAvail && (
                              <span className="h-1.5 w-1.5 rounded-full bg-seafoam-500" />
                            )
                          ) : (
                            <>
                              {daySlots.slice(0, 2).map((s) => (
                                <SlotChip key={s.id} slot={s} compact />
                              ))}
                              {daySlots.length > 2 && (
                                <span className="text-[10px] text-slate-400">
                                  +{daySlots.length - 2} more
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto p-3">
                <div className="grid min-w-[640px] grid-cols-8 gap-1">
                  <div />
                  {weekDays.map((d) => (
                    <div
                      key={keyOf(d)}
                      className={`pb-2 text-center text-xs font-medium ${
                        isToday(d)
                          ? "text-seafoam-600"
                          : "text-slate-400"
                      }`}
                    >
                      {format(d, "EEE d")}
                    </div>
                  ))}
                  {HOURS.map((h) => (
                    <div key={h} className="contents">
                      <div className="py-3 text-right text-[10px] text-slate-400">
                        {h > 12 ? `${h - 12}p` : `${h}a`}
                      </div>
                      {weekDays.map((d) => {
                        const daySlots = slotsForDate(
                          d,
                          slots,
                          availabilityData
                        ).filter((s) => {
                          const sh = Number(s.startTime.split(":")[0]);
                          const eh = Number(s.endTime.split(":")[0]);
                          return h >= sh && h < eh;
                        });
                        return (
                          <div
                            key={`${keyOf(d)}-${h}`}
                            onClick={() => pickDay(d)}
                            className="relative min-h-[28px] cursor-pointer rounded border border-slate-50 hover:bg-seafoam-50/50 dark:border-slate-800/50"
                          >
                            {isToday(d) &&
                              Math.floor(nowMinutes / 60) === h && (
                                <div className="absolute left-0 right-0 top-1/2 z-10 h-px bg-seafoam-500" />
                              )}
                            {daySlots.map((s) => (
                              <div
                                key={s.id}
                                className={`m-0.5 rounded px-1 text-[9px] ${
                                  SLOT_COLORS[s.type]
                                }`}
                              >
                                {SLOT_LABELS[s.type]}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Day detail panel */}
      <AnimatePresence>
        {panelDate && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPanelDate(null)}
              className="absolute inset-0 z-20 bg-black/20"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="absolute right-0 top-0 z-30 flex h-full w-full max-w-sm flex-col bg-white p-5 shadow-2xl dark:bg-slate-900"
            >
              <DayPanel
                date={panelDate}
                mode={mode}
                slots={slotsForDate(panelDate, slots, availabilityData)}
                onClose={() => setPanelDate(null)}
                onSlotDelete={onSlotDelete}
                onSlotSelect={(s) => {
                  onSlotSelect?.(s);
                  setPanelDate(null);
                }}
                onAdd={
                  mode === "cleaner-availability" && onSlotCreate
                    ? () => {
                        onSlotCreate(panelDate, "08:00", "16:00", "flexible");
                      }
                    : undefined
                }
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 border-t border-slate-100 p-3 text-[11px] text-slate-500 dark:border-slate-800">
        {(Object.keys(SLOT_LABELS) as (keyof typeof SLOT_LABELS)[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                SLOT_COLORS[t].split(" ")[0]
              }`}
            />
            {SLOT_LABELS[t]}
          </span>
        ))}
      </div>
    </div>
  );
}

const WINDOW_DEFS: { name: string; label: string; start: string; end: string }[] =
  [
    { name: "morning", label: "Morning (8–12)", start: "08:00", end: "12:00" },
    {
      name: "afternoon",
      label: "Afternoon (12–4)",
      start: "12:00",
      end: "16:00",
    },
    { name: "evening", label: "Evening (4–8)", start: "16:00", end: "20:00" },
  ];

function DayPanel({
  date,
  mode,
  slots,
  onClose,
  onSlotDelete,
  onSlotSelect,
  onAdd,
}: {
  date: Date;
  mode: CalendarProps["mode"];
  slots: CalendarSlot[];
  onClose: () => void;
  onSlotDelete?: (id: string) => void;
  onSlotSelect?: (slot: CalendarSlot) => void;
  onAdd?: () => void;
}) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">{format(date, "EEEE")}</p>
          <h3 className="text-lg font-bold text-charcoal dark:text-white">
            {format(date, "MMMM d, yyyy")}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          Close
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {mode === "customer-booking" ? (
          WINDOW_DEFS.map((w) => {
            const available = slots.some((s) => {
              const sh = Number(s.startTime.split(":")[0]);
              const eh = Number(s.endTime.split(":")[0]);
              const ws = Number(w.start.split(":")[0]);
              const we = Number(w.end.split(":")[0]);
              return sh < we && eh > ws;
            });
            return (
              <motion.button
                key={w.name}
                whileTap={{ scale: 0.97 }}
                disabled={!available}
                onClick={() =>
                  onSlotSelect?.({
                    id: `${keyOf(date)}-${w.name}`,
                    date,
                    startTime: w.start,
                    endTime: w.end,
                    type: "flexible",
                    label: w.label,
                  })
                }
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                  available
                    ? "border-seafoam-300 text-charcoal hover:border-seafoam-500 hover:shadow-[0_0_0_3px] hover:shadow-seafoam-100 dark:text-white"
                    : "cursor-not-allowed border-slate-100 text-slate-300 dark:border-slate-800"
                }`}
              >
                {w.label}
                <span className="text-xs">
                  {available ? "Available" : "Full"}
                </span>
              </motion.button>
            );
          })
        ) : slots.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No availability set for this day.
          </p>
        ) : (
          slots.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800"
            >
              <SlotChip slot={s} />
              {onSlotDelete && s.type !== "booked" && (
                <button
                  onClick={() => onSlotDelete(s.id)}
                  className="text-xs text-red-500 hover:underline"
                >
                  Delete
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {onAdd && (
        <Button className="mt-4 w-full" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" /> Add slot
        </Button>
      )}
      {mode === "cleaner-availability" && (
        <p className="mt-3 flex items-center gap-1 text-[11px] text-amber-500">
          <Zap className="h-3 w-3" /> Toggle &quot;Available Now&quot; for
          same-day jobs.
        </p>
      )}
    </>
  );
}
