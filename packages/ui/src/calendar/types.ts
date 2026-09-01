/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

export type SlotType =
  | "recurring"
  | "flexible"
  | "available_now"
  | "booked"
  | "blocked";

export interface CalendarSlot {
  id: string;
  date: Date;
  /** For recurring slots: 0=Sun..6=Sat. When set, the slot renders on EVERY
   *  matching weekday (past and future weeks), not just `date`'s week. */
  dayOfWeek?: number;
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
  /** "yyyy-MM-dd" keys of dates that cannot be selected (e.g. admin-blocked
   *  booking dates). Disabled days render muted with an "Unavailable" note in
   *  customer-booking mode and never fire onDateChange. Optional — absent
   *  keeps the previous behavior for every existing caller. */
  disabledDates?: string[];
  /** "yyyy-MM-dd" → short label rendered as a small marker on the day cell
   *  (e.g. a date pricing or promotion label). Optional. */
  dateMarkers?: Record<string, string>;
  /** Fires with the first day of the visible month on mount and whenever the
   *  visible month changes, so parents can fetch month-scoped data. */
  onMonthChange?: (monthStart: Date) => void;
}

export const SLOT_COLORS: Record<SlotType, string> = {
  recurring: "bg-seafoam-700 text-white",
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
