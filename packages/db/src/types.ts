/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

// Database row types — mirror the SQL schema in migrations/001_initial.sql.
// Monetary columns are stored as integer cents.

export interface UserRow {
  id: string;
  clerk_id: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerRow {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  stripe_customer_id: string | null;
  account_status: string;
  account_status_until: string | null;
  account_status_reason: string | null;
  created_at: string;
}

export interface CleanerRow {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  bio: string | null;
  avatar_url: string | null;
  status: string;
  stripe_connect_id: string | null;
  account_type: string | null;
  checkr_candidate_id: string | null;
  checkr_report_id: string | null;
  checkr_status: string | null;
  didit_verification_id: string | null;
  didit_status: string | null;
  tier: string;
  rating: string | null;
  total_jobs: number;
  created_at: string;
}

export interface AddressRow {
  id: string;
  user_id: string | null;
  label: string | null;
  street: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  lat: string | null;
  lng: string | null;
  is_default: boolean;
  created_at: string;
}

export interface BookingRow {
  id: string;
  customer_id: string | null;
  cleaner_id: string | null;
  address_id: string | null;
  status: string;
  service_type: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  home_type: string | null;
  has_pets: boolean;
  heavy_mess: boolean;
  supplies_needed: boolean;
  parking_notes: string | null;
  entry_notes: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  base_price: number | null;
  addons_total: number;
  service_fee: number;
  tax: number;
  total_price: number | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  platform_fee: number | null;
  cleaner_payout: number | null;
  notes: string | null;
  cleaning_level: string | null;
  cleaning_level_surcharge_cents: number;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingAddonRow {
  id: string;
  booking_id: string;
  addon_key: string;
  addon_name: string | null;
  price: number | null;
}

export interface ReviewRow {
  id: string;
  booking_id: string;
  customer_id: string | null;
  cleaner_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  booking_id: string | null;
  customer_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  amount: number | null;
  currency: string;
  status: string | null;
  created_at: string;
}

export interface PayoutRow {
  id: string;
  booking_id: string | null;
  cleaner_id: string | null;
  amount: number | null;
  status: string;
  stripe_transfer_id: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string | null;
  type: string | null;
  title: string | null;
  body: string | null;
  read: boolean;
  data: Record<string, unknown> | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Scope review engine (migration 058)
// ---------------------------------------------------------------------------

export interface ScopeReviewRequestRow {
  id: string;
  booking_id: string;
  cleaner_id: string | null;
  customer_id: string | null;
  request_type: string;
  status: string;
  selected_package: string | null;
  selected_condition: string | null;
  cleaner_notes: string | null;
  refusal_reason: string | null;
  ai_confidence: number | null;
  ai_recommendation: string | null;
  ai_response_json: Record<string, unknown> | null;
  admin_decision: string | null;
  admin_id: string | null;
  admin_decided_at: string | null;
  fee_code: string | null;
  fee_amount_cents: number | null;
  photos: string[];
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

export interface BookingPriceLedgerRow {
  id: string;
  booking_id: string;
  event_type: string;
  previous_total_cents: number;
  adjustment_cents: number;
  new_total_cents: number;
  reason: string | null;
  source: string;
  approved_by: string | null;
  customer_consent_id: string | null;
  scope_review_request_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
}

export interface CleanerPrivilegesRow {
  cleaner_id: string;
  additional_attention_enabled: boolean;
  refusal_request_enabled: boolean;
  disabled_reason: string | null;
  disabled_until: string | null;
  stats_window_start: string | null;
  stats_window_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddressGreylistRow {
  id: string;
  street_address: string;
  unit: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  normalized_key: string;
  reason: string | null;
  source_booking_id: string | null;
  customer_id: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface BookingTipRow {
  id: string;
  booking_id: string;
  customer_id: string | null;
  cleaner_id: string | null;
  amount_cents: number;
  stripe_payment_intent_id: string | null;
  status: string;
  visible_to_cleaner: boolean;
  paid_out_at: string | null;
  created_at: string;
  updated_at: string;
}
