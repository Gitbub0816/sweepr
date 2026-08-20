/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { ClerkProvider, SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import { Button } from "@sweepr/ui";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
const AUTH_URL = "https://auth.getsweepr.com/login";

/** Sign in happens on the central branded page (auth.getsweepr.com), not in
 * an embedded Clerk modal. The shared Clerk session means returning here
 * after sign-in shows the signed-in state automatically. */
function goToSignIn() {
  const returnTo = encodeURIComponent(window.location.href);
  window.location.assign(`${AUTH_URL}?return_to=${returnTo}`);
}

/**
 * The actual Clerk-backed auth controls. Lives in its own module (rather
 * than wrapping the whole app in main.tsx) so @clerk/clerk-react is only
 * fetched when this lazily-loaded component mounts — see MarketingAuth.tsx.
 * Owns its own ClerkProvider since the app root no longer provides one.
 */
export default function ClerkAuthControls({ cta }: { cta: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <div className="flex items-center gap-3">
        <SignedOut>
          <Button variant="ghost" size="sm" onClick={goToSignIn}>
            Sign in
          </Button>
        </SignedOut>
        <SignedIn>
          <UserButton afterSignOutUrl="/" />
        </SignedIn>
        {cta}
      </div>
    </ClerkProvider>
  );
}
