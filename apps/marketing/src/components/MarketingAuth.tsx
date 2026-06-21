import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { Button } from "@sweepr/ui";

const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

/**
 * Subtle auth controls for the marketing nav: a quiet "Sign in" link when
 * signed out and the Clerk UserButton when signed in, alongside the primary
 * CTA. Renders just the CTA when Clerk isn't configured.
 */
export function MarketingAuth({ cta }: { cta: React.ReactNode }) {
  if (!CLERK_ENABLED) return <>{cta}</>;
  return (
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
  );
}
