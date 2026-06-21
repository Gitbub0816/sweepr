CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cleaners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  bio TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'pending', -- pending, approved, suspended
  stripe_connect_id TEXT,
  checkr_candidate_id TEXT,
  didit_verification_id TEXT,
  tier TEXT DEFAULT 'standard', -- standard, preferred, elite
  rating DECIMAL(3,2),
  total_jobs INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  label TEXT,
  street TEXT NOT NULL,
  unit TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  country TEXT DEFAULT 'US',
  lat DECIMAL(10,8),
  lng DECIMAL(11,8),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id),
  cleaner_id UUID REFERENCES cleaners(id),
  address_id UUID REFERENCES addresses(id),
  status TEXT NOT NULL DEFAULT 'draft',
  service_type TEXT NOT NULL,
  bedrooms INT,
  bathrooms INT,
  sqft INT,
  home_type TEXT,
  has_pets BOOLEAN DEFAULT false,
  heavy_mess BOOLEAN DEFAULT false,
  supplies_needed BOOLEAN DEFAULT false,
  parking_notes TEXT,
  entry_notes TEXT,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INT,
  base_price INT, -- cents
  addons_total INT DEFAULT 0,
  service_fee INT DEFAULT 0,
  tax INT DEFAULT 0,
  total_price INT,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  platform_fee INT,
  cleaner_payout INT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE booking_addons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  addon_key TEXT NOT NULL,
  addon_name TEXT,
  price INT -- cents
);

CREATE TABLE job_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES bookings(id),
  cleaner_id UUID REFERENCES cleaners(id),
  offered_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  response TEXT -- accepted, declined, expired
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES bookings(id) UNIQUE,
  customer_id UUID REFERENCES customers(id),
  cleaner_id UUID REFERENCES cleaners(id),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES bookings(id),
  customer_id UUID REFERENCES customers(id),
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  amount INT, -- cents
  currency TEXT DEFAULT 'usd',
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES bookings(id),
  cleaner_id UUID REFERENCES cleaners(id),
  amount INT, -- cents
  status TEXT DEFAULT 'pending',
  stripe_transfer_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES bookings(id),
  raised_by UUID REFERENCES users(id),
  reason TEXT,
  description TEXT,
  status TEXT DEFAULT 'open',
  resolution TEXT,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  type TEXT,
  title TEXT,
  body TEXT,
  read BOOLEAN DEFAULT false,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cleaner_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cleaner_id UUID REFERENCES cleaners(id) ON DELETE CASCADE,
  day_of_week INT, -- 0=Sun, 6=Sat
  start_time TIME,
  end_time TIME,
  UNIQUE(cleaner_id, day_of_week)
);

CREATE TABLE cleaner_service_areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cleaner_id UUID REFERENCES cleaners(id) ON DELETE CASCADE,
  center_lat DECIMAL(10,8),
  center_lng DECIMAL(11,8),
  radius_miles INT DEFAULT 15
);

CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_cleaner ON bookings(cleaner_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_users_clerk ON users(clerk_id);

-- Immutable audit trail for security-relevant actions (SOC 2 CC7.1, CIS 8).
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  actor_clerk_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Security hardening
-- ---------------------------------------------------------------------------

-- Row-level security (enable on sensitive tables)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaners ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- Create app role (used by the Worker connection)
-- In production, the DATABASE_URL should use this role, not superuser
DO $$ BEGIN
  CREATE ROLE sweepr_app;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Grant only needed permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO sweepr_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO sweepr_app;

-- Add soft-delete column (for GDPR right to erasure)
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Data retention: add created_at indexes for purge queries
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON admin_audit_log(created_at);

-- Add indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_cleaner_id ON bookings(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_job_offers_booking_id ON job_offers(booking_id);
CREATE INDEX IF NOT EXISTS idx_job_offers_cleaner_id ON job_offers(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_reviews_cleaner_id ON reviews(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, read);

-- ===========================================================================
-- Scheduling, subscriptions & assignment (Part 2)
-- ===========================================================================

-- Cleaner availability slots (their schedule)
CREATE TABLE IF NOT EXISTS cleaner_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cleaner_id UUID REFERENCES cleaners(id) ON DELETE CASCADE,

  -- 'recurring' = repeats every week, 'flexible' = specific date only, 'available_now' = immediate
  slot_type TEXT NOT NULL CHECK (slot_type IN ('recurring', 'flexible', 'available_now')),

  -- For recurring slots
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun
  start_time TIME,
  end_time TIME,

  -- For flexible (one-off) slots
  specific_date DATE,

  -- Applies to both
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer recurring booking subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('weekly', 'biweekly', 'monthly')),
  preferred_day_of_week INT CHECK (preferred_day_of_week BETWEEN 0 AND 6),
  preferred_time_of_day TEXT CHECK (preferred_time_of_day IN ('morning', 'afternoon', 'evening')),
  address_id UUID REFERENCES addresses(id),

  -- Pricing
  display_price INT NOT NULL,  -- cents, shown to customer
  internal_price INT NOT NULL, -- cents, internal

  -- Stripe
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),

  -- Home details (snapshot)
  home_details JSONB,
  add_on_keys TEXT[],
  pricing_inputs JSONB,

  -- Preferred cleaner (optional — customer may request same cleaner)
  preferred_cleaner_id UUID REFERENCES cleaners(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscription bookings (instances generated from subscriptions)
CREATE TABLE IF NOT EXISTS subscription_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id),
  scheduled_for DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'booked', 'completed', 'skipped', 'failed'))
);

-- Job assignment queue (for the matching/cascading system)
CREATE TABLE IF NOT EXISTS assignment_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  cleaner_id UUID REFERENCES cleaners(id),
  offered_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  position INT NOT NULL,  -- 1 = first offered, 2 = second, etc.
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'skipped')),
  score DECIMAL(6,2),
  score_breakdown JSONB
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cleaner_schedule_cleaner_id ON cleaner_schedule(cleaner_id, is_active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_assignment_queue_booking_id ON assignment_queue(booking_id, status);
CREATE INDEX IF NOT EXISTS idx_assignment_queue_cleaner_id ON assignment_queue(cleaner_id, status);
