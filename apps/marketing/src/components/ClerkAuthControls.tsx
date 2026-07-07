/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { Button } from "@sweepr/ui";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

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
          <SignInButton mode="modal">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <UserButton afterSignOutUrl="/" />
        </SignedIn>
        {cta}
      </div>
    </ClerkProvider>
  );
}
