export interface Env {
  ENVIRONMENT: string;
  DATABASE_URL: string;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  MAILERSEND_API_KEY: string;
  FIREBASE_SERVICE_ACCOUNT: string;
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
