import { SignedIn, UserButton } from "@clerk/clerk-react";

const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

/** Header-right cluster for the admin app. */
export function NavAuth() {
  if (!CLERK_ENABLED) return null;
  return (
    <SignedIn>
      <UserButton afterSignOutUrl="/sign-in" />
    </SignedIn>
  );
}
