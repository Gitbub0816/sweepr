export type SlotType =
  | "recurring"
  | "flexible"
  | "available_now"
  | "booked"
  | "blocked";

export interface CalendarSlot {
  id: string;
  date: Date;
  startTime: string; // "09:00"
  endTime: string; // "13:00"
  type: SlotType;
  label?: string;
  cleanerId?: string;
}

export interface CalendarProps {
  mode: "cleaner-availability" | "customer-booking";
  slots?: CalendarSlot[];
  onSlotCreate?: (
    date: Date,
    startTime: string,
    endTime: string,
    type: "recurring" | "flexible"
  ) => void;
  onSlotDelete?: (slotId: string) => void;
  onSlotSelect?: (slot: CalendarSlot) => void; // customer selecting a time
  selectedDate?: Date;
  onDateChange?: (date: Date) => void;
  availabilityData?: Record<string, CalendarSlot[]>; // date string → slots
  isLoading?: boolean;
}

export const SLOT_COLORS: Record<SlotType, string> = {
  recurring: "bg-seafoam-500 text-white",
  flexible: "bg-seafoam-300 text-seafoam-900",
  available_now: "bg-amber-400 text-amber-950",
  booked: "bg-slate-700 text-white",
  blocked: "bg-slate-300 text-slate-700",
};

export const SLOT_LABELS: Record<SlotType, string> = {
  recurring: "Recurring",
  flexible: "One-time",
  available_now: "Available now",
  booked: "Booked",
  blocked: "Blocked",
};
