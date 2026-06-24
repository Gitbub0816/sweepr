export interface Env {
  ENVIRONMENT: string;
  DATABASE_URL: string;
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
  ACCESS_CODE_ENCRYPTION_KEY?: string;
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
