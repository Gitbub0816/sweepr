import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
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

const API = import.meta.env.VITE_API_URL ?? "";

function nextDateForDay(dow: number): Date {
  const d = new Date();
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return d;
}

interface ApiSlot {
  id: string;
  slot_type: "recurring" | "flexible" | "available_now";
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  specific_date: string | null;
}

function apiSlotToCalendar(s: ApiSlot): CalendarSlot | null {
  if (s.slot_type === "available_now") return null;
  const date =
    s.slot_type === "flexible" && s.specific_date
      ? new Date(s.specific_date + "T00:00:00")
      : s.day_of_week != null
        ? nextDateForDay(s.day_of_week)
        : null;
  if (!date) return null;
  return {
    id: s.id,
    date,
    startTime: s.start_time ?? "08:00",
    endTime: s.end_time ?? "17:00",
    type: s.slot_type === "recurring" ? "recurring" : "flexible",
  };
}

export function SchedulePage() {
  const { getToken } = useAuth();
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [availableNow, setAvailableNow] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/schedule/me`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { slots: ApiSlot[]; availableNow: boolean };
      setAvailableNow(data.availableNow);
      setSlots(data.slots.map(apiSlotToCalendar).filter(Boolean) as CalendarSlot[]);
    } catch {
      toast.error("Couldn't load your schedule.");
    }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  async function authFetch(path: string, method: string, body?: object) {
    const token = await getToken();
    const res = await fetch(`${API}/schedule/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error();
    return res.json();
  }

  const toggleAvailableNow = async () => {
    const next = !availableNow;
    setAvailableNow(next);
    try {
      await authFetch("available-now", "POST", { available: next });
      toast.success(next ? "You're available now — accepting same-day jobs" : "Available Now off");
    } catch {
      setAvailableNow(!next);
      toast.error("Couldn't update availability.");
    }
  };

  const handleDelete = async (id: string) => {
    setSlots((s) => s.filter((x) => x.id !== id));
    try {
      await authFetch(`cleaner/${id}`, "DELETE");
      toast.success("Slot removed");
    } catch {
      toast.error("Couldn't remove slot.");
      load();
    }
  };

  const addSlots = async (newSlots: Omit<CalendarSlot, "id">[]) => {
    await load();
    // Optimistic: already shown via load
    toast.success(newSlots.length > 1 ? "Availability saved" : "Slot added");
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
        onSlotCreate={async (date, startTime, endTime) => {
          try {
            await authFetch("cleaner", "POST", {
              slotType: "flexible",
              specificDate: date.toISOString().slice(0, 10),
              startTime,
              endTime,
            });
            await load();
            toast.success("Slot added");
          } catch {
            toast.error("Couldn't add slot.");
          }
        }}
        onSlotDelete={handleDelete}
      />

      <AddSlotModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreate={async ({ type, daysOfWeek, startTime, endTime, date }) => {
          if (type === "available_now") {
            setAvailableNow(true);
            try {
              await authFetch("available-now", "POST", { available: true });
              toast.success("You're available now");
            } catch {
              setAvailableNow(false);
              toast.error("Couldn't update availability.");
            }
            return;
          }
          try {
            if (type === "recurring") {
              await authFetch("cleaner", "POST", {
                slotType: "recurring",
                daysOfWeek,
                startTime,
                endTime,
              });
            } else {
              await authFetch("cleaner", "POST", {
                slotType: "flexible",
                specificDate: (date ?? new Date()).toISOString().slice(0, 10),
                startTime,
                endTime,
              });
            }
            await load();
            addSlots([]);
          } catch {
            toast.error("Couldn't save availability.");
          }
        }}
      />
    </DashboardShell>
  );
}
