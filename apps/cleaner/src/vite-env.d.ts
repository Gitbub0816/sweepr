/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly VITE_MAPBOX_PUBLIC_TOKEN?: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_CUSTOMER_URL?: string;
  readonly VITE_CLEANER_URL?: string;
  readonly VITE_MARKETING_URL?: string;
  /** Prelaunch gate bypass code. Unset = bypass path fully disabled. */
  readonly VITE_PRELAUNCH_BYPASS_CODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
