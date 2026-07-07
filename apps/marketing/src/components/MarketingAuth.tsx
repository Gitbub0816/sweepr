/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { lazy, Suspense } from "react";

const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

// @clerk/clerk-react (and the ClerkProvider it needs) is only pulled in here,
// lazily, so the landing page's initial JS payload never includes Clerk.
// Most marketing visitors are signed out and never trigger this import.
const ClerkAuthControls = lazy(() => import("./ClerkAuthControls"));

/**
 * Subtle auth controls for the marketing nav: a quiet "Sign in" link when
 * signed out and the Clerk UserButton when signed in, alongside the primary
 * CTA. Renders just the CTA when Clerk isn't configured, and defers loading
 * Clerk's SDK until this component mounts (it's below the LCP hero, so this
 * doesn't block first paint).
 */
export function MarketingAuth({ cta }: { cta: React.ReactNode }) {
  if (!CLERK_ENABLED) return <>{cta}</>;
  return (
    <Suspense fallback={cta}>
      <ClerkAuthControls cta={cta} />
    </Suspense>
  );
}
