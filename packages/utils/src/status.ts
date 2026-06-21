import type { JobStatus } from "@sweepr/types";

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  quoted: "Quoted",
  payment_pending: "Payment Pending",
  booked: "Booked",
  matching: "Finding a Cleaner",
  offered_to_cleaner: "Offered to Cleaner",
  cleaner_accepted: "Cleaner Accepted",
  confirmed: "Confirmed",
  cleaner_on_the_way: "On the Way",
  arrived: "Arrived",
  in_progress: "In Progress",
  completed_pending_review: "Pending Review",
  completed: "Completed",
  cancelled_by_customer: "Cancelled",
  cancelled_by_cleaner: "Cancelled by Cleaner",
  refunded: "Refunded",
  disputed: "Disputed",
};

export type StatusTone = "default" | "success" | "warning" | "error" | "info";

export const JOB_STATUS_TONE: Record<JobStatus, StatusTone> = {
  draft: "default",
  quoted: "info",
  payment_pending: "warning",
  booked: "info",
  matching: "info",
  offered_to_cleaner: "info",
  cleaner_accepted: "info",
  confirmed: "success",
  cleaner_on_the_way: "info",
  arrived: "info",
  in_progress: "warning",
  completed_pending_review: "warning",
  completed: "success",
  cancelled_by_customer: "error",
  cancelled_by_cleaner: "error",
  refunded: "default",
  disputed: "error",
};

/** Ordered status timeline used by the customer tracker. */
export const TRACKING_STEPS: JobStatus[] = [
  "booked",
  "confirmed",
  "cleaner_on_the_way",
  "arrived",
  "in_progress",
  "completed",
];
