-- Site-wide settings (key/value)
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults
INSERT INTO site_settings (key, value) VALUES
  ('prelaunch_cleaner', 'true'),
  ('prelaunch_customer', 'true')
ON CONFLICT (key) DO NOTHING;

-- Status incidents
CREATE TABLE IF NOT EXISTS status_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'investigating'
    CHECK (status IN ('investigating','identified','monitoring','resolved')),
  severity TEXT NOT NULL DEFAULT 'minor'
    CHECK (severity IN ('minor','major','critical')),
  affected_features TEXT[] NOT NULL DEFAULT '{}',
  is_prelaunch_update BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Per-incident timeline updates
CREATE TABLE IF NOT EXISTS status_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES status_incidents(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Newsletter subscribers
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Status incident subscribers (per-incident email alerts)
CREATE TABLE IF NOT EXISTS status_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  incident_id UUID NOT NULL REFERENCES status_incidents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(email, incident_id)
);

-- Waitlist (cleaners + customers)
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  zip_code TEXT,
  type TEXT NOT NULL CHECK (type IN ('cleaner','customer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
