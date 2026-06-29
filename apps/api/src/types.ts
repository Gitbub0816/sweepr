export interface Env {
  ENVIRONMENT: string;
  DATABASE_URL: string;
  /** Optional comma-separated list of emails that always get super_admin. */
  SUPER_ADMIN_EMAILS?: string;
  /** Optional comma-separated list of Clerk user ids that always get super_admin. */
  SUPER_ADMIN_CLERK_IDS?: string;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  MAILERSEND_API_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_PUBLIC_URL: string;
  CUSTOMER_URL?: string;
  CHECKR_API_KEY?: string;
  CHECKR_PACKAGE?: string;
  CHECKR_WEBHOOK_SECRET?: string;
  DIDIT_API_KEY?: string;
  DIDIT_WORKFLOW_ID?: string;
  DIDIT_WORKFLOW_ID_BUSINESS?: string;
  DIDIT_WEBHOOK_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  POSTHOG_KEY?: string;
  SEED_BOOL?: string;
  RATE_LIMIT_KV: KVNamespace;
  CLEANER_APP_URL?: string;
  ADMIN_URL?: string;
  R2_LEGAL_ACCESS_KEY_ID: string;
  R2_LEGAL_SECRET_ACCESS_KEY: string;
  ACCESS_CODE_ENCRYPTION_KEY?: string;
  CF_STREAM_ACCOUNT_ID?: string;
  CF_STREAM_API_TOKEN?: string;
  CLERK_WEBHOOK_SECRET?: string;
  // External observability integrations (server-side proxied — never exposed to the browser).
  CF_ANALYTICS_TOKEN?: string;
  CF_ZONE_ID?: string;
  SENTRY_AUTH_TOKEN?: string;
  SENTRY_ORG?: string;
  SENTRY_PROJECT?: string;
  // Slack integration (server-side only — never exposed to the browser).
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  SLACK_SIGNING_SECRET?: string;
  // MailerSend inbound route signing secret (security@ inbox).
  MAILERSEND_INBOUND_SECRET?: string;
}

export interface AuthUser {
  clerkId: string;
  email?: string;
}

export type AppBindings = {
  Bindings: Env;
  Variables: {
    user: AuthUser;
  };
};
