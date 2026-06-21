import type { ServiceType } from "@sweepr/types";

export interface AvailableJob {
  id: string;
  serviceType: ServiceType;
  area: string; // partial address until accepted
  pay: number;
  distanceMi: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  timeSlot: string;
  date: string;
}

export const availableJobs: AvailableJob[] = [
  { id: "job_501", serviceType: "standard", area: "Hillcrest, San Diego", pay: 71, distanceMi: 2.3, bedrooms: 2, bathrooms: 1, sqft: 1100, timeSlot: "10:00 AM", date: "Tomorrow" },
  { id: "job_502", serviceType: "deep", area: "North Park, San Diego", pay: 142, distanceMi: 4.1, bedrooms: 3, bathrooms: 2, sqft: 1850, timeSlot: "8:00 AM", date: "Tomorrow" },
  { id: "job_503", serviceType: "move_in_out", area: "La Jolla, San Diego", pay: 188, distanceMi: 7.8, bedrooms: 4, bathrooms: 3, sqft: 2400, timeSlot: "12:00 PM", date: "Sat, Jun 27" },
  { id: "job_504", serviceType: "recurring", area: "Mission Valley", pay: 63, distanceMi: 3.0, bedrooms: 1, bathrooms: 1, sqft: 750, timeSlot: "2:00 PM", date: "Sat, Jun 27" },
];

export interface TodayJob {
  id: string;
  serviceType: ServiceType;
  address: string;
  customer: string;
  pay: number;
  timeSlot: string;
}

export const todayJobs: TodayJob[] = [
  { id: "job_410", serviceType: "standard", address: "1240 Seaview Ave", customer: "Jane D.", pay: 71, timeSlot: "9:00 AM" },
  { id: "job_411", serviceType: "deep", address: "88 Bayfront Pl", customer: "Marcus T.", pay: 142, timeSlot: "1:00 PM" },
];

export const weeklyEarnings = [
  { day: "Mon", amount: 213 },
  { day: "Tue", amount: 142 },
  { day: "Wed", amount: 305 },
  { day: "Thu", amount: 0 },
  { day: "Fri", amount: 188 },
  { day: "Sat", amount: 254 },
  { day: "Sun", amount: 71 },
];

export const monthlyEarnings = [
  { label: "Week 1", amount: 980 },
  { label: "Week 2", amount: 1240 },
  { label: "Week 3", amount: 1105 },
  { label: "Week 4", amount: 1373 },
];
