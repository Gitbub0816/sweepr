import { useClerk, useUser } from "@clerk/clerk-react";
import { LogOut } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { NotificationBell } from "@sweepr/ui";
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

export function NavAuth() {
  const { signOut } = useClerk();
  const { isSignedIn } = useUser();
  const navigate = useNavigate();

  if (!CLERK_ENABLED) return <Bell />;

  if (!isSignedIn) {
    return (
      <Link
        to="/sign-in"
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-seafoam-600 transition hover:bg-seafoam-50 dark:text-seafoam-400 dark:hover:bg-slate-800"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Bell />
      <button
        onClick={() => void signOut(() => navigate("/sign-in"))}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </button>
    </div>
  );
}
