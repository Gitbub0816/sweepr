-- Copyright © 2026–Present ClearKey Solutions, LLC.
-- All Rights Reserved.
--
-- Proprietary and Confidential.
--
-- Unauthorized copying, modification, disclosure,
-- distribution, reverse engineering, or use is prohibited.

-- Site analytics (first-party, individualized) — DELIBERATELY separate from
-- the observability tables (analytics_events / api_request_logs), which track
-- product/API telemetry. These tables back the admin Site Analytics dashboard
-- and the /go/{code} tracking-link redirector served by the sweepr-analytics
-- worker (apps/analytics). Privacy posture: no raw IPs are ever stored — only
-- a salted SHA-256 hash — and geolocation is city-level (Cloudflare request
-- metadata), which keeps the store free of directly identifying data.

-- Admin-created short links: https://getsweepr.com/go/{code} → destination.
-- `source` is the acquisition channel (google, chatgpt, facebook, nextdoor…);
-- `campaign_id` is the optional coupon/ad-campaign discriminator.
CREATE TABLE IF NOT EXISTS tracking_links (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT        NOT NULL UNIQUE,
  label               TEXT        NOT NULL,
  source              TEXT        NOT NULL,
  campaign_id         TEXT,
  -- Path on getsweepr.com ("/pricing") or an absolute https URL on a
  -- *.getsweepr.com host. The worker validates again at redirect time so a
  -- corrupted row can never turn the redirector into an open redirect.
  destination         TEXT        NOT NULL DEFAULT '/',
  notes               TEXT,
  active              BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Denormalized fast counters so the links table renders without scanning
  -- site_events; the event stream remains the source of truth for analysis.
  hit_count           BIGINT      NOT NULL DEFAULT 0,
  last_hit_at         TIMESTAMPTZ,
  created_by_clerk_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per tracked interaction (pageview / click / link_hit / custom).
-- visitor_id + session_id are client-generated anonymous identifiers scoped
-- to *.getsweepr.com; they never contain account identity.
CREATE TABLE IF NOT EXISTS site_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  app          TEXT        NOT NULL,
  event_type   TEXT        NOT NULL,
  visitor_id   TEXT        NOT NULL,
  session_id   TEXT        NOT NULL,
  path         TEXT,
  referrer     TEXT,
  -- Attribution at event time (first captured on landing, carried forward).
  source       TEXT,
  campaign_id  TEXT,
  link_code    TEXT,
  -- Click payload (event_type = 'click').
  click_target TEXT,
  click_href   TEXT,
  click_text   TEXT,
  -- Device (parsed server-side from the user agent at ingest).
  device_type  TEXT,
  browser      TEXT,
  browser_ver  TEXT,
  os           TEXT,
  os_ver       TEXT,
  screen_w     INT,
  screen_h     INT,
  viewport_w   INT,
  viewport_h   INT,
  language     TEXT,
  -- Geo from Cloudflare request metadata (city-level; lat/lon power the
  -- admin globe and are city centroids, not precise positions).
  country      TEXT,
  region       TEXT,
  city         TEXT,
  timezone     TEXT,
  latitude     REAL,
  longitude    REAL,
  asn_org      TEXT,
  -- Salted SHA-256 of the client IP (never the raw IP).
  ip_hash      TEXT,
  is_bot       BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Optional IPinfo enrichment (privacy/VPN/company signals), present only
  -- when the worker has an IPINFO_TOKEN configured.
  ipinfo       JSONB,
  meta         JSONB       NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_site_events_occurred ON site_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_events_type     ON site_events(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_events_session  ON site_events(session_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_site_events_visitor  ON site_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_site_events_link     ON site_events(link_code) WHERE link_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_events_path     ON site_events(path, occurred_at DESC);

-- One row per browsing session, upserted at ingest so the admin session
-- explorer and live-now views never scan the event stream. duration/bounce
-- are derived (last_seen_at - first_seen_at, pageviews = 1).
CREATE TABLE IF NOT EXISTS site_sessions (
  session_id    TEXT        PRIMARY KEY,
  visitor_id    TEXT        NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  app           TEXT,
  entry_path    TEXT,
  exit_path     TEXT,
  referrer      TEXT,
  source        TEXT,
  campaign_id   TEXT,
  link_code     TEXT,
  device_type   TEXT,
  browser       TEXT,
  os            TEXT,
  country       TEXT,
  region        TEXT,
  city          TEXT,
  latitude      REAL,
  longitude     REAL,
  is_bot        BOOLEAN     NOT NULL DEFAULT FALSE,
  pageviews     INT         NOT NULL DEFAULT 0,
  clicks        INT         NOT NULL DEFAULT 0,
  events        INT         NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_site_sessions_last    ON site_sessions(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_sessions_visitor ON site_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_site_sessions_source  ON site_sessions(source) WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_sessions_link    ON site_sessions(link_code) WHERE link_code IS NOT NULL;
