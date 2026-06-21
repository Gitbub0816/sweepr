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

// ---------------------------------------------------------------------------
// Detail-view mock data
// ---------------------------------------------------------------------------

export interface AdminApplicationDetail {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatarUrl: string;
  bio: string;
  experience: string;
  basedIn: string;
  center: [number, number]; // [lng, lat]
  radiusMi: number;
  services: ServiceType[];
  availability: Record<string, string>;
  checkrStatus: "submitted" | "clear" | "consider" | "pending";
  diditStatus: "submitted" | "verified" | "pending";
  submittedAt: string;
}

export const adminApplicationDetails: Record<string, AdminApplicationDetail> = {
  app_1: {
    id: "app_1",
    name: "Jordan Blake",
    email: "jordan@example.com",
    phone: "(555) 201-9912",
    avatarUrl: "",
    bio: "Detail-oriented cleaner with 6 years of residential experience. I take pride in spotless kitchens and bathrooms and always treat homes with care.",
    experience: "6 years residential, IICRC certified.",
    basedIn: "San Diego, CA",
    center: [-117.1611, 32.7157],
    radiusMi: 18,
    services: ["standard", "deep", "move_in_out"],
    availability: { Mon: "all_day", Tue: "morning", Wed: "all_day", Thu: "afternoon", Fri: "all_day", Sat: "morning", Sun: "unavailable" },
    checkrStatus: "submitted",
    diditStatus: "verified",
    submittedAt: "2026-06-19",
  },
  app_2: {
    id: "app_2",
    name: "Casey Wu",
    email: "casey@example.com",
    phone: "(555) 332-0044",
    avatarUrl: "",
    bio: "Friendly, reliable, and thorough. I specialize in recurring cleans and eco-friendly products.",
    experience: "3 years, green-cleaning focus.",
    basedIn: "La Mesa, CA",
    center: [-117.0231, 32.7678],
    radiusMi: 12,
    services: ["standard", "recurring"],
    availability: { Mon: "morning", Tue: "morning", Wed: "morning", Thu: "morning", Fri: "afternoon", Sat: "unavailable", Sun: "unavailable" },
    checkrStatus: "pending",
    diditStatus: "submitted",
    submittedAt: "2026-06-20",
  },
};

export interface DisputeAuditEntry {
  at: string;
  actor: string;
  action: string;
}

export interface AdminDisputeDetail extends AdminDispute {
  cleaner: string;
  serviceType: ServiceType;
  scheduledFor: string;
  pricePaid: number;
  customerDescription: string;
  evidence: string[];
  audit: DisputeAuditEntry[];
}

export const adminDisputeDetails: Record<string, AdminDisputeDetail> = {
  dp_1: {
    id: "dp_1",
    bookingId: "bk_2005",
    customer: "Jane Doe",
    cleaner: "Sam Rivera",
    reason: "Quality issue",
    amount: 71,
    status: "open",
    serviceType: "standard",
    scheduledFor: "2026-06-15",
    pricePaid: 71,
    customerDescription:
      "The bathroom mirrors and kitchen counters were left streaky, and the floors under the bed weren't done.",
    evidence: ["https://example.com/evidence/1.jpg", "https://example.com/evidence/2.jpg"],
    audit: [
      { at: "2026-06-16 09:12", actor: "system", action: "Dispute opened by customer" },
      { at: "2026-06-16 10:40", actor: "admin@sweep-r.com", action: "Assigned for review" },
    ],
  },
  dp_2: {
    id: "dp_2",
    bookingId: "bk_1980",
    customer: "Marcus Tan",
    cleaner: "Dana Kim",
    reason: "No-show",
    amount: 142,
    status: "investigating",
    serviceType: "deep",
    scheduledFor: "2026-06-12",
    pricePaid: 142,
    customerDescription:
      "Cleaner never arrived and didn't respond to messages. I had to reschedule my whole day.",
    evidence: [],
    audit: [
      { at: "2026-06-12 14:02", actor: "system", action: "Dispute opened by customer" },
      { at: "2026-06-13 08:30", actor: "admin@sweep-r.com", action: "Contacted cleaner" },
    ],
  },
};

export interface AdminPayoutDetail {
  id: string;
  cleaner: string;
  bookingId: string;
  amount: number;
  status: "pending" | "paid" | "failed";
  date: string;
}

export const adminPayoutRecords: AdminPayoutDetail[] = [
  { id: "po_1", cleaner: "Alex Lee", bookingId: "bk_2001", amount: 5680, status: "paid", date: "2026-06-15" },
  { id: "po_2", cleaner: "Sam Rivera", bookingId: "bk_2003", amount: 15040, status: "pending", date: "2026-06-18" },
  { id: "po_3", cleaner: "Dana Kim", bookingId: "bk_2004", amount: 5040, status: "pending", date: "2026-06-19" },
  { id: "po_4", cleaner: "Alex Lee", bookingId: "bk_1998", amount: 7100, status: "failed", date: "2026-06-10" },
];
