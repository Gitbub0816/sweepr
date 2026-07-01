// Only allow valid status transitions. Prevents manipulation via API.
const TRANSITIONS: Record<string, string[]> = {
  draft: ["quoted", "cancelled_by_customer"],
  quoted: ["payment_pending", "cancelled_by_customer"],
  payment_pending: ["booked", "cancelled_by_customer"],
  booked: ["matching", "cancelled_by_customer", "refunded"],
  matching: ["offered_to_cleaner", "cancelled_by_customer"],
  offered_to_cleaner: ["cleaner_accepted", "matching", "cancelled_by_customer"],
  cleaner_accepted: ["confirmed", "cancelled_by_cleaner", "refunded"],
  confirmed: ["cleaner_on_the_way", "cancelled_by_cleaner", "refunded"],
  cleaner_on_the_way: ["arrived"],
  arrived: ["in_progress"],
  // Day-of-service checkout marks the booking completed directly (photo
  // evidence stands in for a separate review step); completed_pending_review
  // remains available for flows that do want an explicit review window.
  in_progress: ["completed_pending_review", "completed"],
  completed_pending_review: ["completed", "disputed", "refunded"],
  completed: ["disputed", "refunded"],
  cancelled_by_customer: ["refunded"],
  cancelled_by_cleaner: ["matching", "refunded"],
  disputed: ["completed", "refunded"],
  refunded: [],
};

export function isValidTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidTransition(from: string, to: string): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid status transition: ${from} → ${to}`);
  }
}
