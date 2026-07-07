/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

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
  completedAt?: string; // ISO — set when the job is completed
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

// ---------------------------------------------------------------------------
// Scope review engine (cleaning levels, additional-attention / refusal
// requests, AI triage, price ledger, tips, account status)
// ---------------------------------------------------------------------------

export type CleaningLevel = "refresh" | "extra_attention" | "significant_attention";

export type ScopeReviewRequestType = "additional_attention" | "refusal";

export type ScopeReviewStatus =
  | "pending_ai"
  | "pending_admin"
  | "approved"
  | "denied"
  | "hard_denied"
  | "expired"
  | "cancelled";

export type CustomerAccountStatus =
  | "normal"
  | "investigating"
  | "restricted"
  | "suspended"
  | "banned";

export type ScopeReviewFeeCode =
  | "none"
  | "additional_attention_small"
  | "additional_attention_medium"
  | "additional_attention_large"
  | "refusal_fee";

export type RefusalReason =
  | "excessive_clutter"
  | "hoarding"
  | "unsafe_environment"
  | "biohazard"
  | "animal_hazard"
  | "structural_hazard"
  | "inaccessible"
  | "scope_exceeded"
  | "other";

export interface AiScopeReviewSafetyFlags {
  biohazard: boolean;
  hoarding_indicators: boolean;
  blocked_access: boolean;
  animal_hazard: boolean;
  unsafe_environment: boolean;
  visible_damage_risk: boolean;
}

export interface AiScopeReviewResult {
  decision_recommendation: "approve" | "deny" | "human_review" | "hard_deny";
  confidence: number;
  scope_level_detected:
    | "refresh"
    | "extra_attention"
    | "significant_attention"
    | "refusal_required"
    | "unsafe_or_excluded";
  primary_reason: string;
  supporting_observations: string[];
  missing_evidence: string[];
  customer_facing_summary: string;
  admin_summary: string;
  recommended_fee_code: ScopeReviewFeeCode;
  safety_flags: AiScopeReviewSafetyFlags;
}

// ---------------------------------------------------------------------------
// Room-condition based home cleaning ("Clean My Home" flow)
//
// Replaces the package + cleaning-level model with per-room visual condition
// selection. Customers pick the image that best matches the WORST room of each
// type. Pricing derived from these levels is NEVER shown during the flow — only
// the final owed amount at review.
// ---------------------------------------------------------------------------

export type RoomType = "kitchen" | "bathroom" | "bedroom" | "living_room";

export type RoomConditionLevel = "level_1" | "level_2" | "level_3" | "level_4";

export interface RoomConditionSelection {
  roomType: RoomType;
  level: RoomConditionLevel;
}

export type HomeCleaningIntent = "home" | "short_term_rental";

export interface HomeCleaningPropertyDetails {
  homeType: HomeType;
  sqft: number;
  bedrooms: number;
  bathrooms: number;
}

export interface HomeCleaningPriceInput {
  property: HomeCleaningPropertyDetails;
  rooms: RoomConditionSelection[];
  addOnKeys: string[];
}

/** Result shape: customer sees only `customerVisible`; admin/DB gets breakdown. */
export interface HomeCleaningPriceResult {
  customerVisible: {
    totalOwed: number; // dollars, the ONLY number shown to the customer
    currency: string;
  };
  internalBreakdown: {
    baseFeeCents: number;
    sqftCents: number;
    bedroomCents: number;
    bathroomCents: number;
    roomConditionCents: number;
    addOnsCents: number;
    subtotalCents: number;
    roundingDeltaCents: number;
    taxCents: number;
    feeCents: number;
    totalCents: number;
    lineItems: Array<{ label: string; amountCents: number }>;
  };
}

// ---------------------------------------------------------------------------
// Short-term rental calendar sync
// ---------------------------------------------------------------------------

export type CalendarProvider =
  | "airbnb"
  | "vrbo"
  | "booking_com"
  | "google_calendar"
  | "pms"
  | "other";

export interface ShortTermRentalProperty {
  id: string;
  customerId: string;
  nickname: string;
  streetAddress: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  monthlyFeeCents: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarSource {
  id: string;
  propertyId: string;
  provider: CalendarProvider;
  icsUrl: string;
  autoBook: boolean;
  syncIntervalMinutes: number;
  status: "active" | "paused" | "error";
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  lastSyncEventCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportedCalendarReservation {
  id: string;
  propertyId: string;
  calendarSourceId: string;
  externalUid: string | null;
  summary: string | null;
  icsStatus: string | null;
  checkinDate: string | null;
  checkoutDate: string;
  cleaningStatus: "pending" | "scheduled" | "skipped" | "cancelled";
  bookingId: string | null;
  createdAt: string;
  updatedAt: string;
}
