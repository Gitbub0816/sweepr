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
