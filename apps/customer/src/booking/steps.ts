export interface StepDef {
  path: string;
  label: string;
}

export const BOOKING_STEPS: StepDef[] = [
  { path: "/book/address", label: "Address" },
  { path: "/book/home", label: "Home" },
  { path: "/book/service", label: "Service" },
  { path: "/book/schedule", label: "Schedule" },
  { path: "/book/review", label: "Review" },
  { path: "/book/payment", label: "Payment" },
  { path: "/book/confirmed", label: "Done" },
];

export function stepIndex(pathname: string): number {
  const i = BOOKING_STEPS.findIndex((s) => pathname.startsWith(s.path));
  return i === -1 ? 0 : i;
}
