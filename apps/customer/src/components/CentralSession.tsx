/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Central-auth session gate (pilot integration with the Sweepr auth broker).
 *
 * Behind VITE_CENTRAL_AUTH_ENABLED — an explicit migration gate: when the
 * flag is "true" this gate replaces the Clerk ProtectedRoute entirely; when
 * off, Clerk gating runs untouched. The two paths are never active together.
 *
 * Before rendering any protected page (and therefore before any API call or
 * PII render), the provider asks the same-origin BFF (/auth/session) whether
 * the HttpOnly session cookie is active. Anything but {active:true} sends the
 * browser to /auth/login immediately; until then nothing renders but a
 * minimal splash. No token ever reaches this code — the BFF keeps it.
 */

import { createContext, useContext, useEffect, useState } from "react";
import { SweeprLoader } from "@sweepr/ui";

export const CENTRAL_AUTH_ENABLED = import.meta.env.VITE_CENTRAL_AUTH_ENABLED === "true";

export interface CentralSession {
  active: true;
  principalUserId: string | null;
  expiresAt: string | null;
}

const SessionContext = createContext<CentralSession | null>(null);

export function useCentralSession(): CentralSession | null {
  return useContext(SessionContext);
}

function redirectToLogin(): void {
  const path = window.location.pathname;
  // Never return to the auth entry routes themselves — that just re-enters the
  // ceremony and loops (or dead-ends). Send those to a real destination.
  const returnTo =
    path === "/sign-in" || path === "/sign-up" ? "/" : path + window.location.search;
  window.location.assign(`/auth/login?return_to=${encodeURIComponent(returnTo)}`);
}

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center">
      <SweeprLoader label="Redirecting to sign-in…" />
    </div>
  );
}

/** Route element for /sign-in and /sign-up when central auth is on: the app
 * never renders its own credential UI — it hands off to the broker ceremony
 * (which lands on auth.getsweepr.com) and comes back with a session cookie. */
export function RedirectToCentralLogin() {
  useEffect(() => {
    redirectToLogin();
  }, []);
  return <Splash />;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<CentralSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/auth/session", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          active?: boolean;
          principal_user_id?: string | null;
          expires_at?: string | null;
        };
        if (cancelled) return;
        if (res.ok && data.active === true) {
          setSession({
            active: true,
            principalUserId: data.principal_user_id ?? null,
            expiresAt: data.expires_at ?? null,
          });
        } else {
          redirectToLogin();
        }
      } catch {
        if (!cancelled) redirectToLogin();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // No active session verified yet → render nothing but the splash. Children
  // (which fetch data and render PII) mount only after introspection passes.
  if (!session) return <Splash />;
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** Sign-out control for central-auth mode: POST-only, then back to sign-in. */
export function CentralSignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
        } catch {
          /* cookie is expired server-side on best effort; proceed regardless */
        }
        // Land on a signed-out destination — NOT /auth/login, which would
        // immediately re-enter the login ceremony (and, if a central Clerk
        // session is still live, pass it straight back through and sign the
        // user right back in — i.e. "sign out doesn't work").
        window.location.assign("https://getsweepr.com");
      }}
    >
      Sign out
    </button>
  );
}
