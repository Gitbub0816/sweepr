export interface Env {
  ENVIRONMENT: string;
  DATABASE_URL: string;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  MAILERSEND_API_KEY: string;
  FIREBASE_SERVICE_ACCOUNT: string;
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
  RATE_LIMIT_KV?: KVNamespace;
}

/** Minimal Cloudflare KV interface (avoids a hard dependency on @cloudflare/workers-types). */
export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void>;
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
