/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useClerk, useUser } from "@clerk/clerk-react";
import { CENTRAL_AUTH_ENABLED } from "./CentralSession";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

  if (!isSignedIn) return null;

  return (
    <div className="flex items-center gap-2">
      <Bell />
      <button
        onClick={async () => {
          // Central mode: revoke the broker session cookie AND end the shared
          // Clerk session — otherwise the broker would immediately pass you
          // back in — then leave to the signed-out marketing site (NOT "/",
          // which just re-enters the login ceremony).
          if (CENTRAL_AUTH_ENABLED) {
            try {
              await fetch("/auth/logout", { method: "POST" });
            } catch {
              /* revoke best-effort; still end the Clerk session below */
            }
            try {
              await signOut();
            } catch {
              /* ignore */
            }
            window.location.assign("https://getsweepr.com");
            return;
          }
          void signOut(() => navigate("/sign-in"));
        }}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </button>
    </div>
  );
}
