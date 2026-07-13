-- Copyright © 2026–Present ClearKey Solutions, LLC.
-- Proprietary & Confidential. Internal Use Only.
--
-- Platform identity + workspace model (multi-app auth architecture).
--
-- Sweepr runs four separate Clerk applications (customer, business, cleaner,
-- admin), each an isolated auth silo with its own user pool. This migration
-- adds the Sweepr-owned layer that connects them:
--
--   Clerk authenticates access to ONE app;
--   Sweepr identifies the person, organizations, workspaces, memberships,
--   and permissions ACROSS the platform.
--
-- Three concepts, never collapsed:
--   auth identity     — a user inside one Clerk application
--   platform person   — the canonical human
--   membership        — what that person can do inside a workspace
--
-- Everything here is ADDITIVE. The legacy `users` table remains the join point
-- for all existing FKs; platform_people/auth_identities wrap it so current
-- code keeps working while new boundaries adopt the richer model.

-- ── Canonical person ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_people (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Bridge to the legacy fused record; one person per users row initially.
  user_id          UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  first_name       TEXT,
  last_name        TEXT,
  display_name     TEXT,
  canonical_email  TEXT,
  canonical_phone  TEXT,
  avatar_url       TEXT,
  locale           TEXT,
  timezone         TEXT,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','suspended','deleted')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_people_email ON platform_people (LOWER(canonical_email));

-- ── App-scoped authentication identities ─────────────────────────────────────
-- One row per (Clerk application, Clerk user). The same person may hold several
-- (customer + business + cleaner); admin identities are NEVER auto-linked by
-- email — linking requires explicit provisioning (see lib/identity.ts).
CREATE TABLE IF NOT EXISTS auth_identities (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_person_id    UUID NOT NULL REFERENCES platform_people(id) ON DELETE CASCADE,
  auth_provider         TEXT NOT NULL DEFAULT 'clerk',
  auth_application      TEXT NOT NULL
                          CHECK (auth_application IN ('customer','business','cleaner','admin')),
  provider_user_id      TEXT NOT NULL,
  primary_email         TEXT,
  primary_phone         TEXT,
  email_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','suspended','deleted')),
  last_authenticated_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (auth_application, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_auth_identities_person ON auth_identities (platform_person_id);
CREATE INDEX IF NOT EXISTS idx_auth_identities_email ON auth_identities (auth_application, LOWER(primary_email));

-- ── Optional legal/operational parent entity ─────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_organizations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name          TEXT NOT NULL,
  legal_name            TEXT,
  tax_profile_reference TEXT,
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','suspended','closed')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Workspaces ────────────────────────────────────────────────────────────────
-- personal_customer: the implicit workspace every customer already has.
-- business_customer: managed only through the Business app.
-- cleaner_business:  managed only through the Cleaner app.
CREATE TABLE IF NOT EXISTS workspaces (
  id                             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_organization_id       UUID REFERENCES platform_organizations(id) ON DELETE SET NULL,
  workspace_category             TEXT NOT NULL
                                   CHECK (workspace_category IN ('personal_customer','business_customer','cleaner_business')),
  name                           TEXT NOT NULL,
  legal_name                     TEXT,
  slug                           TEXT UNIQUE,
  logo_url                       TEXT,
  business_type                  TEXT,
  status                         TEXT NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active','pending_identity_claim','suspended','archived','closed')),
  created_by_platform_person_id  UUID REFERENCES platform_people(id) ON DELETE SET NULL,
  timezone                       TEXT,
  locale                         TEXT,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspaces_category ON workspaces (workspace_category, status);

-- ── Roles (Sweepr-owned; Clerk org roles are only coarse session hints) ──────
-- Permissions are a TEXT[] of permission keys; the catalog lives in
-- lib/rbac.ts so new keys don't need migrations. System roles are seeded per
-- category and are not deletable by workspaces.
CREATE TABLE IF NOT EXISTS workspace_roles (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_category TEXT NOT NULL
                       CHECK (workspace_category IN ('personal_customer','business_customer','cleaner_business')),
  key                TEXT NOT NULL,
  label              TEXT NOT NULL,
  description        TEXT,
  permissions        TEXT[] NOT NULL DEFAULT '{}',
  is_system          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_category, key)
);

-- Business Customer roles (spec §14)
INSERT INTO workspace_roles (workspace_category, key, label, permissions) VALUES
  ('business_customer','owner','Owner',
   '{workspace.manage,workspace.close,workspace.transfer,members.manage,properties.manage,bookings.manage,billing.manage,reports.view,integrations.manage}'),
  ('business_customer','admin','Admin',
   '{workspace.manage,members.manage,properties.manage,bookings.manage,reports.view}'),
  ('business_customer','property_manager','Property Manager',
   '{properties.assigned,bookings.manage,bookings.communicate,properties.instructions}'),
  ('business_customer','scheduler','Scheduler',
   '{properties.view,bookings.create,bookings.reschedule,bookings.cancel}'),
  ('business_customer','billing_manager','Billing Manager',
   '{billing.manage,billing.view,invoices.export}'),
  ('business_customer','accountant','Accountant',
   '{billing.view,invoices.export}'),
  ('business_customer','viewer','Viewer',
   '{properties.view,bookings.view}')
ON CONFLICT (workspace_category, key) DO NOTHING;

-- Cleaner Business roles (spec §15)
INSERT INTO workspace_roles (workspace_category, key, label, permissions) VALUES
  ('cleaner_business','owner','Owner',
   '{workspace.manage,workspace.close,workspace.transfer,members.manage,payouts.manage,compliance.manage,areas.manage,jobs.manage,reports.view}'),
  ('cleaner_business','operations_admin','Operations Admin',
   '{jobs.manage,schedules.manage,assignments.manage,areas.manage,reports.view}'),
  ('cleaner_business','dispatcher','Dispatcher',
   '{jobs.view,jobs.accept,assignments.manage,schedules.view,team.communicate}'),
  ('cleaner_business','team_lead','Team Lead',
   '{team.assigned,jobs.assigned,jobs.review}'),
  ('cleaner_business','cleaner','Cleaner',
   '{jobs.assigned,jobs.checkin,jobs.photos,jobs.complete,schedule.own}'),
  ('cleaner_business','compliance_manager','Compliance Manager',
   '{compliance.view,compliance.manage,eligibility.suspend}'),
  ('cleaner_business','finance','Finance',
   '{earnings.view,payouts.export,fees.view}')
ON CONFLICT (workspace_category, key) DO NOTHING;

-- Personal customer role (implicit owner of one's own workspace)
INSERT INTO workspace_roles (workspace_category, key, label, permissions) VALUES
  ('personal_customer','owner','Owner','{workspace.manage,properties.manage,bookings.manage,billing.manage}')
ON CONFLICT (workspace_category, key) DO NOTHING;

-- ── Memberships ───────────────────────────────────────────────────────────────
-- auth_identity_id pins WHICH app silo may exercise this membership: a Business
-- membership is never authorized through a Customer session even for the same
-- person (spec §12).
CREATE TABLE IF NOT EXISTS workspace_memberships (
  id                             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id                   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform_person_id             UUID NOT NULL REFERENCES platform_people(id) ON DELETE CASCADE,
  auth_identity_id               UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  role_id                        UUID NOT NULL REFERENCES workspace_roles(id),
  membership_status              TEXT NOT NULL DEFAULT 'active'
                                   CHECK (membership_status IN ('invited','active','suspended','removed')),
  invited_by_platform_person_id  UUID REFERENCES platform_people(id) ON DELETE SET NULL,
  invited_at                     TIMESTAMPTZ,
  accepted_at                    TIMESTAMPTZ,
  suspended_at                   TIMESTAMPTZ,
  removed_at                     TIMESTAMPTZ,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, platform_person_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_person ON workspace_memberships (platform_person_id, membership_status);
CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON workspace_memberships (workspace_id, membership_status);

-- Optional per-membership resource scoping (e.g. property managers limited to
-- specific properties). Empty = all workspace resources of that type.
CREATE TABLE IF NOT EXISTS membership_resource_scopes (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  membership_id  UUID NOT NULL REFERENCES workspace_memberships(id) ON DELETE CASCADE,
  resource_type  TEXT NOT NULL,   -- 'property' | 'team' | 'region' …
  resource_id    UUID NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (membership_id, resource_type, resource_id)
);

-- ── Invitations (spec §11) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_invitations (
  id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id                    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  target_application              TEXT NOT NULL CHECK (target_application IN ('business','cleaner','admin')),
  invited_email                   TEXT NOT NULL,
  invited_role_id                 UUID NOT NULL REFERENCES workspace_roles(id),
  invited_by_platform_person_id   UUID REFERENCES platform_people(id) ON DELETE SET NULL,
  invited_by_auth_identity_id     UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  token_hash                      TEXT NOT NULL UNIQUE,  -- sha256; raw token never stored
  status                          TEXT NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at                      TIMESTAMPTZ NOT NULL,
  accepted_by_auth_identity_id    UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  accepted_by_platform_person_id  UUID REFERENCES platform_people(id) ON DELETE SET NULL,
  accepted_at                     TIMESTAMPTZ,
  revoked_at                      TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ws_invites_email ON workspace_invitations (LOWER(invited_email), status);

-- ── Cross-app transitions (spec §4.3) ────────────────────────────────────────
-- Secure bridge for customer→business conversion, invitation claims, cleaner
-- identity linking, ownership transfer. Tokens: random, single-use, short-lived,
-- stored hashed, bound to the intended person + action.
CREATE TABLE IF NOT EXISTS cross_app_transitions (
  id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_application           TEXT NOT NULL CHECK (source_application IN ('customer','business','cleaner','admin')),
  source_auth_identity_id      UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  target_application           TEXT NOT NULL CHECK (target_application IN ('customer','business','cleaner','admin')),
  intended_platform_person_id  UUID REFERENCES platform_people(id) ON DELETE CASCADE,
  transition_type              TEXT NOT NULL
                                 CHECK (transition_type IN ('create_business_workspace','convert_customer_to_business',
                                                            'claim_business_invitation','link_cleaner_identity',
                                                            'transfer_workspace_ownership')),
  workspace_id                 UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  payload                      JSONB,               -- e.g. property ids to partition (never secrets)
  token_hash                   TEXT NOT NULL UNIQUE,
  status                       TEXT NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','completed','expired','cancelled')),
  expires_at                   TIMESTAMPTZ NOT NULL,
  completed_auth_identity_id   UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  completed_at                 TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Clerk organization ↔ Sweepr workspace mapping (spec §16.1) ───────────────
CREATE TABLE IF NOT EXISTS clerk_organization_mappings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  auth_application      TEXT NOT NULL CHECK (auth_application IN ('customer','business','cleaner','admin')),
  clerk_organization_id TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (auth_application, clerk_organization_id)
);

-- ── Billing profiles per context (spec §18) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_profiles (
  id                                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id                      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  billing_context                   TEXT NOT NULL
                                      CHECK (billing_context IN ('personal_customer','business_customer','cleaner_subscription','cleaner_payout')),
  legal_name                        TEXT,
  billing_email                     TEXT,
  billing_address                   JSONB,
  tax_reference                     TEXT,
  payment_provider_customer_id      TEXT,
  default_payment_method_reference  TEXT,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, billing_context)
);

-- ── Property → workspace ownership (spec §17) ────────────────────────────────
-- Existing `addresses` rows ARE the properties; a nullable workspace pointer
-- keeps legacy paths working while partition/conversion moves rows to business
-- workspaces. NULL = legacy personal (owner inferred from user_id).
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_addresses_workspace ON addresses (workspace_id);

-- ── Backfill ──────────────────────────────────────────────────────────────────
-- 1) One platform person per existing user, names from customer/cleaner profile.
INSERT INTO platform_people (user_id, first_name, last_name, canonical_email)
SELECT u.id,
       COALESCE(c.first_name, cl.first_name),
       COALESCE(c.last_name,  cl.last_name),
       u.email
FROM users u
LEFT JOIN customers c ON c.user_id = u.id
LEFT JOIN cleaners cl ON cl.user_id = u.id
ON CONFLICT (user_id) DO NOTHING;

-- 2) Auth identities. Today customers + cleaners share ONE Clerk application,
--    so a person with both profiles gets a 'customer' AND a 'cleaner' identity
--    carrying the same provider_user_id; when the Cleaner Clerk app is split,
--    new cleaner logins re-point the cleaner identity to the new pool.
INSERT INTO auth_identities (platform_person_id, auth_application, provider_user_id, primary_email, email_verified)
SELECT p.id, 'customer', u.clerk_id, u.email, TRUE
FROM users u JOIN platform_people p ON p.user_id = u.id
WHERE EXISTS (SELECT 1 FROM customers c WHERE c.user_id = u.id)
ON CONFLICT (auth_application, provider_user_id) DO NOTHING;

INSERT INTO auth_identities (platform_person_id, auth_application, provider_user_id, primary_email, email_verified)
SELECT p.id, 'cleaner', u.clerk_id, u.email, TRUE
FROM users u JOIN platform_people p ON p.user_id = u.id
WHERE EXISTS (SELECT 1 FROM cleaners cl WHERE cl.user_id = u.id)
ON CONFLICT (auth_application, provider_user_id) DO NOTHING;

-- Users with neither profile yet (fresh signups) default to a customer identity.
INSERT INTO auth_identities (platform_person_id, auth_application, provider_user_id, primary_email, email_verified)
SELECT p.id, 'customer', u.clerk_id, u.email, TRUE
FROM users u JOIN platform_people p ON p.user_id = u.id
WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM cleaners cl WHERE cl.user_id = u.id)
ON CONFLICT (auth_application, provider_user_id) DO NOTHING;
-- Admin identities are intentionally NOT backfilled: admin linking requires
-- explicit provisioning (spec §3.2/§22); lib/identity.ts creates them on first
-- verified admin login.

-- 3) A personal workspace + owner membership for every customer.
INSERT INTO workspaces (workspace_category, name, status, created_by_platform_person_id)
SELECT 'personal_customer',
       COALESCE(NULLIF(TRIM(CONCAT(p.first_name,' ',p.last_name)),''), p.canonical_email, 'Personal'),
       'active', p.id
FROM platform_people p
JOIN users u ON u.id = p.user_id
WHERE EXISTS (SELECT 1 FROM customers c WHERE c.user_id = u.id)
  AND NOT EXISTS (
    SELECT 1 FROM workspace_memberships m
    JOIN workspaces w ON w.id = m.workspace_id AND w.workspace_category = 'personal_customer'
    WHERE m.platform_person_id = p.id
  );

INSERT INTO workspace_memberships (workspace_id, platform_person_id, auth_identity_id, role_id, membership_status, accepted_at)
SELECT w.id, w.created_by_platform_person_id, ai.id, r.id, 'active', NOW()
FROM workspaces w
JOIN workspace_roles r ON r.workspace_category = 'personal_customer' AND r.key = 'owner'
LEFT JOIN auth_identities ai
       ON ai.platform_person_id = w.created_by_platform_person_id AND ai.auth_application = 'customer'
WHERE w.workspace_category = 'personal_customer'
  AND w.created_by_platform_person_id IS NOT NULL
ON CONFLICT (workspace_id, platform_person_id) DO NOTHING;

-- 4) Point personal addresses at the owner's personal workspace.
UPDATE addresses a
SET workspace_id = m.workspace_id
FROM platform_people p
JOIN workspace_memberships m ON m.platform_person_id = p.id
JOIN workspaces w ON w.id = m.workspace_id AND w.workspace_category = 'personal_customer'
WHERE a.user_id = p.user_id AND a.workspace_id IS NULL;

-- ── RLS parity ────────────────────────────────────────────────────────────────
ALTER TABLE platform_people             ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_identities             ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_organizations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_resource_scopes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invitations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_app_transitions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clerk_organization_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_profiles            ENABLE ROW LEVEL SECURITY;
