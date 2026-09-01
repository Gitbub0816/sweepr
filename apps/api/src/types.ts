/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

export interface Env {
  ENVIRONMENT: string;
  DATABASE_URL: string;
  /** Optional comma-separated list of emails that always get super_admin. */
  SUPER_ADMIN_EMAILS?: string;
  /** Optional comma-separated list of Clerk user ids that always get super_admin. */
  SUPER_ADMIN_CLERK_IDS?: string;
  CLERK_SECRET_KEY: string;
  /**
   * Secret key of the SEPARATE Clerk application serving the admin console
   * (primary domain admin.getsweepr.com). Bearer tokens issued by
   * clerk.admin.getsweepr.com are verified against this key instead of
   * CLERK_SECRET_KEY, and the identity is mapped onto the canonical users row
   * by verified email.
   */
  CLERK_ADMIN_SECRET_KEY?: string;
  /** Svix signing secret (whsec_…) for the admin Clerk app's webhook endpoint. */
  CLERK_ADMIN_WEBHOOK_SECRET?: string;
  /**
   * Secret key of the SEPARATE Clerk application serving the business portal
   * (business.getsweepr.com). Until this is set, the business auth boundary is
   * dark: business-issued tokens can't exist, so /business routes 401.
   */
  CLERK_BUSINESS_SECRET_KEY?: string;
  /** Svix signing secret for the business Clerk app's webhook endpoint. */
  CLERK_BUSINESS_WEBHOOK_SECRET?: string;
  /**
   * Secret key of the dedicated cleaner Clerk application, once cleaners are
   * split out of the shared primary instance. While unset, cleaner tokens are
   * issued by the primary instance and verified with CLERK_SECRET_KEY (the
   * current shared-pool behavior).
   */
  CLERK_CLEANER_SECRET_KEY?: string;
  /** Svix signing secret for the dedicated cleaner Clerk app's webhook endpoint. */
  CLERK_CLEANER_WEBHOOK_SECRET?: string;
  /**
   * Shared HMAC secret for central-auth-mode API tokens. The per-app Pages
   * Functions BFF (which holds the broker session) mints a short-lived HS256
   * token after introspecting the session; this key verifies it. When unset,
   * broker-issued API tokens are rejected (Clerk-token auth still works), so a
   * misconfiguration fails closed rather than trusting unsigned identities.
   */
  API_BROKER_TOKEN_SECRET?: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  MAILERSEND_API_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_PUBLIC_URL: string;
  CUSTOMER_URL?: string;
  YARDSTIK_API_KEY?: string;
  YARDSTIK_ACCOUNT_PACKAGE_ID?: string;
  /** account_package_id of the ongoing SOR (Sex Offender Registry) monitoring
   * package. When set, approved cleaners are auto-enrolled in continuous
   * monitoring; when unset, enrollment is skipped (no behavior change). */
  YARDSTIK_SOR_MONITOR_PACKAGE_ID?: string;
  /** Optional override for staging/sandbox Yardstik hosts. Defaults to https://api.yardstik.com. */
  YARDSTIK_API_URL?: string;
  /** Value of the Yardstik dashboard API key literally named WEBHOOK_SIGNATURE. */
  YARDSTIK_WEBHOOK_SIGNATURE?: string;
  DIDIT_API_KEY?: string;
  DIDIT_WEBHOOK_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  POSTHOG_KEY?: string;
  RATE_LIMIT_KV: KVNamespace;
  /** PRIVATE R2 bucket (sweepr-report-objects) for user-report photo evidence.
   * Never publicly readable — uploads/reads stream through the API; retrieval
   * is admin-only (routes/reports.ts + routes/adminReports.ts). */
  REPORT_OBJECTS: R2Bucket;
  CLEANER_APP_URL?: string;
  ADMIN_URL?: string;
  R2_LEGAL_ACCESS_KEY_ID: string;
  R2_LEGAL_SECRET_ACCESS_KEY: string;
  /** HMAC signing key for external reviewing-attorney portal sessions.
   *  Optional — falls back to a key derived from DATABASE_URL when unset. */
  LEGAL_ATTORNEY_SESSION_SECRET?: string;
  ACCESS_CODE_ENCRYPTION_KEY?: string;
  // Smart Entry — Seam smart-lock provider (server-side only). When unset,
  // Smart Entry falls back to manual/scheduled codes only (no remote unlock).
  SEAM_API_KEY?: string;
  SEAM_WEBHOOK_SECRET?: string;
  // Sweepr+ subscription — Stripe recurring price IDs (price_… ; publishable
  // enough to live in config, but kept server-side to gate checkout).
  SWEEPR_PLUS_MONTHLY_PRICE_ID?: string;
  SWEEPR_PLUS_ANNUAL_PRICE_ID?: string;
  CF_STREAM_ACCOUNT_ID?: string;
  CF_STREAM_API_TOKEN?: string;
  CLERK_WEBHOOK_SECRET?: string;
  // External observability integrations (server-side proxied — never exposed to the browser).
  CF_ANALYTICS_TOKEN?: string;
  CF_ZONE_ID?: string;
  SENTRY_AUTH_TOKEN?: string;
  /** Sentry project DSN — enables server-side forwarding of ALL errors (see lib/sentryForward.ts). */
  SENTRY_DSN?: string;
  SENTRY_ORG?: string;
  SENTRY_PROJECT?: string;
  // Slack integration (server-side only — never exposed to the browser).
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  SLACK_SIGNING_SECRET?: string;
  // MailerSend inbound route signing secrets — one per inbound route.
  MAILERSEND_IT_INBOUND_SECRET?: string;
  MAILERSEND_SECURITY_INBOUND_SECRET?: string;
  MAILERSEND_CALEB_INBOUND_SECRET?: string;
  MAILERSEND_KRISTIN_INBOUND_SECRET?: string;
  MAILERSEND_NEWS_INBOUND_SECRET?: string;
  MAILERSEND_UPDATES_INBOUND_SECRET?: string;
  MAILERSEND_HELP_INBOUND_SECRET?: string;
  MAILERSEND_ALERTS_INBOUND_SECRET?: string;
  // Consolidated mailbox routing: the six shared boxes are served by two
  // combined MailerSend routes that each forward to the single /mail/inbound
  // dispatcher; one signing secret per combined route.
  MAILERSEND_INBOUND_SECRET_1?: string;
  MAILERSEND_INBOUND_SECRET_2?: string;
  // MailerSend outbound event webhook signing secret.
  MAILERSEND_WEBHOOK_SECRET?: string;
  ANTHROPIC_API_KEY?: string;
  // OpenAI (server-side only — vision scope review). Never exposed to the browser.
  OPENAI_API_KEY?: string;
  /** Optional override for the scope-review vision model. Defaults to gpt-4.1-mini. */
  OPENAI_VISION_MODEL?: string;
  // MailerSend SMS (server-side only; reuses MAILERSEND_API_KEY for sends).
  // Outbound sends are disabled until MAILERSEND_SMS_FROM is set; the inbound
  // STOP/START/HELP webhook is disabled until its signing secret is set.
  MAILERSEND_SMS_FROM?: string;
  MAILERSEND_SMS_INBOUND_SECRET?: string;
}

export interface AuthUser {
  clerkId: string;
  email?: string;
}

export type AppBindings = {
  Bindings: Env;
  Variables: {
    user: AuthUser;
    /** Which Clerk application issued the verified token (multi-app auth). */
    authApp: import("./lib/authApps").AuthApplication;
    /** Raw Clerk user id from the verified token, BEFORE any admin email
     * mapping onto the canonical users row — the per-app identity key. */
    providerUserId: string;
  };
};
