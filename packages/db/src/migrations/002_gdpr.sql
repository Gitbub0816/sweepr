-- GDPR data subject request log
CREATE TABLE IF NOT EXISTS data_subject_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  request_type TEXT NOT NULL CHECK (request_type IN ('export', 'delete', 'correct', 'restrict')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  handled_by UUID REFERENCES users(id)
);

-- Consent log (GDPR Art. 7)
CREATE TABLE IF NOT EXISTS consent_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  consent_type TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subprocessors
CREATE TABLE IF NOT EXISTS subprocessors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  country TEXT NOT NULL,
  data_types TEXT[] NOT NULL,
  dpa_signed_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true
);

INSERT INTO subprocessors (name, purpose, country, data_types) VALUES
  ('Clerk', 'Identity and authentication', 'US', ARRAY['email', 'name', 'phone']),
  ('Stripe', 'Payment processing', 'US', ARRAY['payment_card', 'billing_address', 'name']),
  ('Checkr', 'Background verification', 'US', ARRAY['name', 'date_of_birth', 'ssn', 'address']),
  ('Didit', 'Identity verification', 'US', ARRAY['government_id', 'selfie', 'name', 'date_of_birth']),
  ('Neon', 'Database hosting', 'US', ARRAY['all_application_data']),
  ('Cloudflare', 'CDN and compute', 'US', ARRAY['ip_address', 'request_logs']),
  ('Firebase', 'File storage', 'US', ARRAY['photos', 'documents']),
  ('MailerSend', 'Email delivery', 'EU', ARRAY['email', 'name'])
ON CONFLICT DO NOTHING;
