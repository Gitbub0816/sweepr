import type {
  Booking,
  JobStatus,
  ServiceType,
  CleanerStatus,
} from "@sweepr/types";
import { calculateQuote } from "@sweepr/utils";

const home = { bedrooms: 2, bathrooms: 1, sqft: 1100, homeType: "apartment" as const, pets: false };
const addr = { id: "a", line1: "1240 Seaview Ave", city: "San Diego", state: "CA", zip: "92101" };

function mk(
  id: string,
  status: JobStatus,
  serviceType: ServiceType,
  cleanerId?: string
): Booking {
  return {
    id,
    customerId: "cust_1",
    cleanerId,
    status,
    serviceType,
    home,
    address: addr,
    addOnKeys: [],
    cadence: "none",
    scheduledFor: new Date().toISOString(),
    quote: calculateQuote({ serviceType, home, addOnKeys: [] }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const adminJobs: Booking[] = [
  mk("bk_2001", "in_progress", "standard", "cl_4"),
  mk("bk_2002", "matching", "deep"),
  mk("bk_2003", "completed", "move_in_out", "cl_2"),
  mk("bk_2004", "confirmed", "recurring", "cl_7"),
  mk("bk_2005", "disputed", "standard", "cl_4"),
  mk("bk_2006", "cancelled_by_customer", "deep"),
];

export interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  bookings: number;
  spend: number;
  joined: string;
}

export const adminCustomers: AdminCustomer[] = [
  { id: "cust_1", name: "Jane Doe", email: "jane@example.com", bookings: 12, spend: 1840, joined: "2025-01-12" },
  { id: "cust_2", name: "Marcus Tan", email: "marcus@example.com", bookings: 5, spend: 720, joined: "2025-03-03" },
  { id: "cust_3", name: "Priya Singh", email: "priya@example.com", bookings: 28, spend: 4120, joined: "2024-11-21" },
];

export interface AdminCleaner {
  id: string;
  name: string;
  email: string;
  status: CleanerStatus;
  rating: number;
  jobs: number;
}

export const adminCleaners: AdminCleaner[] = [
  { id: "cl_2", name: "Alex Lee", email: "alex@example.com", status: "approved", rating: 4.9, jobs: 142 },
  { id: "cl_4", name: "Sam Rivera", email: "sam@example.com", status: "approved", rating: 4.7, jobs: 98 },
  { id: "cl_7", name: "Dana Kim", email: "dana@example.com", status: "suspended", rating: 3.8, jobs: 41 },
];

export const adminApplications: AdminCleaner[] = [
  { id: "app_1", name: "Jordan Blake", email: "jordan@example.com", status: "in_review", rating: 0, jobs: 0 },
  { id: "app_2", name: "Casey Wu", email: "casey@example.com", status: "pending_application", rating: 0, jobs: 0 },
];

export interface AdminDispute {
  id: string;
  bookingId: string;
  customer: string;
  reason: string;
  amount: number;
  status: string;
}

export const adminDisputes: AdminDispute[] = [
  { id: "dp_1", bookingId: "bk_2005", customer: "Jane Doe", reason: "Quality issue", amount: 71, status: "open" },
  { id: "dp_2", bookingId: "bk_1980", customer: "Marcus Tan", reason: "No-show", amount: 142, status: "investigating" },
];

export interface AdminPayout {
  id: string;
  cleaner: string;
  amount: number;
  period: string;
  status: string;
}

export const adminPayouts: AdminPayout[] = [
  { id: "po_1", cleaner: "Alex Lee", amount: 1240, period: "Jun 9–15", status: "paid" },
  { id: "po_2", cleaner: "Sam Rivera", amount: 980, period: "Jun 9–15", status: "in_transit" },
  { id: "po_3", cleaner: "Dana Kim", amount: 410, period: "Jun 9–15", status: "pending" },
];
