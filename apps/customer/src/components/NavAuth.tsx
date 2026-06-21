import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { Button, NotificationBell } from "@sweepr/ui";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../hooks/useNotifications";

const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

function Bell() {
  const navigate = useNavigate();
  const { notifications, markRead, markAllRead } = useNotifications();
  return (
    <NotificationBell
      notifications={notifications}
      onMarkRead={markRead}
      onMarkAllRead={markAllRead}
      onNavigate={(href) => navigate(href)}
    />
  );
}

/** Header-right cluster: notifications + Clerk user button / sign-in. */
export function NavAuth() {
  if (!CLERK_ENABLED) {
    return <Bell />;
  }
  return (
    <div className="flex items-center gap-2">
      <SignedIn>
        <Bell />
        <UserButton afterSignOutUrl="/sign-in" />
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal">
          <Button size="sm" variant="secondary">
            Sign in
          </Button>
        </SignInButton>
      </SignedOut>
    </div>
  );
}
