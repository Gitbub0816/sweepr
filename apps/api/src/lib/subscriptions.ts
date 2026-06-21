import type { SubscriptionCadence } from "@sweepr/types";

/** Days to advance for each cadence. */
const CADENCE_DAYS: Record<SubscriptionCadence, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

/** Stripe recurring interval config for each cadence. */
export function stripeRecurringInterval(cadence: SubscriptionCadence): {
  interval: "week" | "month";
  interval_count: number;
} {
  switch (cadence) {
    case "weekly":
      return { interval: "week", interval_count: 1 };
    case "biweekly":
      return { interval: "week", interval_count: 2 };
    case "monthly":
      return { interval: "month", interval_count: 1 };
  }
}

/**
 * Compute the next occurrence date for a subscription. If a preferred day of
 * week is set, advance to the next matching day; otherwise add the cadence
 * interval from today.
 */
export function nextOccurrenceDate(
  cadence: SubscriptionCadence,
  preferredDayOfWeek: number | null,
  from: Date = new Date()
): Date {
  const d = new Date(from);
  if (preferredDayOfWeek != null && preferredDayOfWeek >= 0) {
    // Next matching weekday, at least 2 days out.
    d.setDate(d.getDate() + 2);
    while (d.getUTCDay() !== preferredDayOfWeek) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  }
  d.setDate(d.getDate() + CADENCE_DAYS[cadence]);
  return d;
}
