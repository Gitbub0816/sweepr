// ---------------------------------------------------------------------------
// Sweepr shared domain types
// ---------------------------------------------------------------------------

export type JobStatus =
  | "draft"
  | "quoted"
  | "payment_pending"
  | "booked"
  | "matching"
  | "offered_to_cleaner"
  | "cleaner_accepted"
  | "confirmed"
  | "cleaner_on_the_way"
  | "arrived"
  | "in_progress"
  | "completed_pending_review"
  | "completed"
  | "cancelled_by_customer"
  | "cancelled_by_cleaner"
  | "refunded"
  | "disputed";

export type UserRole = "customer" | "cleaner" | "admin" | "super_admin";

export type ServiceType =
  | "light"
  | "standard"
  | "deep"
  | "move_in_out"
  | "recurring"
  | "post_construction"
  | "vacation_rental";

export type HomeType = "apartment" | "house" | "condo" | "townhouse" | "studio" | "large_house";

export type RecurringCadence = "weekly" | "biweekly" | "monthly" | "none";

export type SubscriptionCadence = "weekly" | "biweekly" | "monthly";

export type SubscriptionStatus = "active" | "paused" | "cancelled";

export type TimeWindow = "morning" | "afternoon" | "evening";

export interface Subscription extends BaseEntity {
  customerId: string;
  serviceType: ServiceType;
  cadence: SubscriptionCadence;
  preferredDayOfWeek?: number;
  preferredTimeOfDay?: TimeWindow;
  displayPrice: number; // cents
  internalPrice: number; // cents
  stripeSubscriptionId?: string;
  status: SubscriptionStatus;
  nextCleaningDate?: string;
  preferredCleanerId?: string;
}

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "partially_refunded";

export type PayoutStatus = "pending" | "in_transit" | "paid" | "failed";

export type CleanerStatus =
  | "pending_application"
  | "in_review"
  | "approved"
  | "suspended"
  | "rejected";

export type VerificationStatus =
  | "not_started"
  | "pending"
  | "verified"
  | "failed";

export type DisputeStatus = "open" | "investigating" | "resolved" | "rejected";

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  id: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  label?: string;
}

export interface Customer extends BaseEntity {
  clerkId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  addresses: Address[];
  defaultAddressId?: string;
  stripeCustomerId?: string;
}

export interface Cleaner extends BaseEntity {
  clerkId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  bio?: string;
  status: CleanerStatus;
  verification: VerificationStatus;
  rating: number;
  jobsCompleted: number;
  serviceAreaZips: string[];
  services: ServiceType[];
  availability: AvailabilitySlot[];
  stripeAccountId?: string;
}

export interface AvailabilitySlot {
  day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  start: string; // "08:00"
  end: string; // "17:00"
}

export interface Service extends BaseEntity {
  type: ServiceType;
  name: string;
  description: string;
  basePrice: number;
  durationMinutes: number;
}

export interface AddOn extends BaseEntity {
  key: string;
  name: string;
  description?: string;
  price: number;
}

export interface HomeDetails {
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  homeType: HomeType;
  pets: boolean;
}

export interface PriceLineItem {
  label: string;
  amount: number;
}

export interface Quote {
  serviceType: ServiceType;
  basePrice: number;
  lineItems: PriceLineItem[];
  addOnTotal: number;
  subtotal: number;
  serviceFee: number;
  tax: number;
  total: number;
}

export interface Booking extends BaseEntity {
  customerId: string;
  cleanerId?: string;
  status: JobStatus;
  serviceType: ServiceType;
  home: HomeDetails;
  address: Address;
  addOnKeys: string[];
  cadence: RecurringCadence;
  scheduledFor: string; // ISO
  quote: Quote;
  notes?: string;
  paymentId?: string;
}

export interface Payment extends BaseEntity {
  bookingId: string;
  customerId: string;
  amount: number;
  status: PaymentStatus;
  cardBrand?: string;
  cardLast4?: string;
  stripePaymentIntentId?: string;
}

export interface PaymentMethod extends BaseEntity {
  customerId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export interface Review extends BaseEntity {
  bookingId: string;
  customerId: string;
  cleanerId: string;
  rating: number;
  comment?: string;
}

export interface Payout extends BaseEntity {
  cleanerId: string;
  bookingId?: string;
  amount: number;
  status: PayoutStatus;
  periodStart: string;
  periodEnd: string;
}

export interface Dispute extends BaseEntity {
  bookingId: string;
  customerId: string;
  cleanerId?: string;
  status: DisputeStatus;
  reason: string;
  description: string;
  amountContested?: number;
}

export interface CleanerApplication extends BaseEntity {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  serviceAreaZips: string[];
  services: ServiceType[];
  status: CleanerStatus;
  verification: VerificationStatus;
}

export interface PricingRule {
  key: string;
  label: string;
  amount: number;
  type: "base" | "per_unit" | "addon" | "threshold";
}
