-- Confirmed service areas (live + upcoming) with GeoJSON polygon for map display
CREATE TABLE IF NOT EXISTS service_areas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  status      TEXT        NOT NULL DEFAULT 'upcoming' CHECK (status IN ('live', 'upcoming')),
  -- GeoJSON polygon as [[lng,lat],...] stored as JSONB
  polygon     JSONB,
  center_lat  DOUBLE PRECISION,
  center_lng  DOUBLE PRECISION,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Bay Area as the first live market
INSERT INTO service_areas (name, slug, status, center_lat, center_lng, polygon) VALUES (
  'Bay Area', 'bay-area', 'live', 37.7749, -122.4194,
  '[ [-122.608,37.907],[-122.271,38.103],[-121.997,38.047],[-121.560,37.981],[-121.483,37.650],[-121.573,37.348],[-121.748,37.183],[-122.001,37.047],[-122.379,37.093],[-122.472,37.283],[-122.513,37.475],[-122.510,37.707],[-122.608,37.907] ]'
) ON CONFLICT (slug) DO NOTHING;

-- City requests — one row per submission (includes optional lat/lng from client geocoding)
CREATE TABLE IF NOT EXISTS city_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  input       TEXT        NOT NULL,   -- raw text the user typed
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS city_requests_created_idx ON city_requests(created_at DESC);

-- City update subscribers — separate from newsletter and waitlist
-- area_slug NULL means "any city / notify me when you expand"
CREATE TABLE IF NOT EXISTS city_subscribers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL,
  area_slug   TEXT,
  city_input  TEXT,                   -- what they typed when subscribing
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Expression-based unique index (inline UNIQUE with COALESCE is not valid PostgreSQL syntax)
CREATE UNIQUE INDEX IF NOT EXISTS city_subscribers_email_slug_idx
  ON city_subscribers(email, COALESCE(area_slug, ''));
CREATE INDEX IF NOT EXISTS city_subscribers_slug_idx ON city_subscribers(area_slug);

-- Broadcast history — one row per send (all list types)
CREATE TABLE IF NOT EXISTS broadcast_sends (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  audience    TEXT        NOT NULL,   -- 'newsletter'|'waitlist_customer'|'waitlist_cleaner'|'city'|'all'
  area_slug   TEXT,                   -- set when audience='city'
  subject     TEXT        NOT NULL,
  html        TEXT        NOT NULL,
  sent_count  INTEGER     NOT NULL DEFAULT 0,
  sent_by     TEXT        NOT NULL,   -- clerk_id
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
