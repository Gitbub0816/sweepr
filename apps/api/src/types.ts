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
  // MailerSend inbound route signing secrets — one per inbound route.
  MAILERSEND_IT_INBOUND_SECRET?: string;
  MAILERSEND_SECURITY_INBOUND_SECRET?: string;
  // MailerSend outbound event webhook signing secret.
  MAILERSEND_WEBHOOK_SECRET?: string;
  ANTHROPIC_API_KEY?: string;
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
  };
};
