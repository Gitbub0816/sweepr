/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_CUSTOMER_URL?: string;
  readonly VITE_CLEANER_URL?: string;
  readonly VITE_MARKETING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
