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
  DIDIT_API_KEY?: string;
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
