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
  checkr_candidate_id: string | null;
  didit_verification_id: string | null;
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
