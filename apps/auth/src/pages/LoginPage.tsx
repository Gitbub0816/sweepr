/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, useClerk, SignIn, SignUp } from "@clerk/clerk-react";
import { Loader2, ShieldCheck } from "lucide-react";
import { SweeprLogo, ThemeToggle } from "@sweepr/ui";
import {
  buildRedirectUrl,
  completeTransaction,
  fetchTransactionContext,
  isValidHandle,
  type TransactionContext,
} from "../broker";

const BUSINESS_WORDMARK =
  "https://objects.getsweepr.com/site_assets/public/Sweepr-biz-logo-transparent.png";

const LEGAL_URL = "https://legal.getsweepr.com";

type Phase =
  | { name: "loading" }
  | { name: "expired" }
  | { name: "ready"; context: TransactionContext }
  | { name: "completing"; context: TransactionContext }
  | { name: "error"; context: TransactionContext; message: string };

function Wordmark({ appId, displayName }: { appId: string; displayName: string }) {
  if (appId === "business") {
    return (
      <img
        src={BUSINESS_WORDMARK}
        alt={displayName}
        className="h-16 w-auto object-contain"
        draggable={false}
      />
    );
  }
  return <SweeprLogo size="md" />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-offwhite to-seafoam-50 px-4 py-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {children}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5" />
        Secured by Sweepr Identity Protection
      </p>
      <nav aria-label="Legal" className="mt-1.5 flex items-center gap-4 text-xs text-slate-400">
        <a href={`${LEGAL_URL}/terms`} target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 hover:underline dark:hover:text-slate-200">Terms</a>
        <a href={`${LEGAL_URL}/privacy`} target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 hover:underline dark:hover:text-slate-200">Privacy</a>
        <a href={LEGAL_URL} target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 hover:underline dark:hover:text-slate-200">All legal documents</a>
      </nav>
    </div>
  );
}

function ExpiredState() {
  return (
    <Shell>
      <div className="flex flex-col items-center text-center">
        <SweeprLogo size="md" />
        <h1 className="mt-6 text-xl font-bold text-charcoal dark:text-white">
          There's nothing to sign in to here
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          This page only works when a Sweepr app sends you here to sign in, and
          each visit is valid for just a few minutes. Head back to the app you
          were using and choose Sign in again.
        </p>
        <a
          href="https://getsweepr.com"
          className="mt-6 inline-flex h-10 items-center rounded-xl bg-charcoal px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Go to getsweepr.com
        </a>
      </div>
    </Shell>
  );
}

// Clerk's prebuilt components carry the full authentication surface (email
// code, password, OAuth, 2FA, and — on sign-up — the required first/last name).
// We strip their card chrome so they sit inside our own Shell, and let the
// session-watch effect below run the broker completion once Clerk is done.
const clerkAppearance = {
  variables: {
    colorPrimary: "#14b8a6",
    colorText: "#1c1a17",
    colorBackground: "transparent",
    colorInputBackground: "#ffffff",
    borderRadius: "0.75rem",
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    fontSize: "0.95rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none border-0",
    card: "shadow-none border-0 bg-transparent p-0",
    header: "hidden",
    footer: "hidden",
    logoBox: "hidden",
    formButtonPrimary:
      "bg-charcoal hover:bg-slate-800 text-white text-sm font-semibold normal-case rounded-xl h-10",
    socialButtonsBlockButton: "rounded-xl border-slate-300 h-10",
    formFieldInput: "rounded-xl border-slate-300",
  },
} as const;

/** The central sign-in ceremony.
 *
 * Authentication is delegated ENTIRELY to Clerk (one central instance), but
 * each app is ISOLATED: signing into one app must NEVER silently sign you into
 * the others. The central Clerk session is treated as ephemeral — cleared on
 * arrival — so a login for THIS app requires its own explicit authentication.
 * Only after that fresh authentication does the broker mint the target app's
 * own session and redirect. (Clearing the Clerk session never touches other
 * apps' already-minted session cookies, so they stay signed in.) A fresh token
 * (getToken skipCache) is minted at completion for the broker's freshness rule. */
export function LoginPage() {
  const [params] = useSearchParams();
  const tx = params.get("tx");
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const clerk = useClerk();

  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  // Gate: true once any lingering central session has been cleared, so the
  // completion effect only ever fires for an authentication performed HERE.
  const [readyForAuth, setReadyForAuth] = useState(false);
  const loadedFor = useRef<string | null>(null);
  const clearing = useRef(false);
  const completing = useRef(false);

  const loadContext = useCallback(async () => {
    if (!isValidHandle(tx)) {
      setPhase({ name: "expired" });
      return;
    }
    setPhase({ name: "loading" });
    const res = await fetchTransactionContext(tx);
    if (!res.ok) {
      setPhase({ name: "expired" });
      return;
    }
    setPhase({ name: "ready", context: res.context });
  }, [tx]);

  useEffect(() => {
    if (loadedFor.current === tx) return;
    loadedFor.current = tx;
    void loadContext();
  }, [tx, loadContext]);

  const context =
    phase.name === "ready" || phase.name === "error" || phase.name === "completing"
      ? phase.context
      : null;

  useEffect(() => {
    if (context) document.title = `Sign in to ${context.display_name}`;
  }, [context]);

  /** Pass the established Clerk login to the target app: mint a fresh token,
   * hand it to the broker, and redirect to the app's own session. */
  const finishWithSession = useCallback(
    async (ctx: TransactionContext) => {
      if (!isValidHandle(tx)) return;
      const token = await getToken({ skipCache: true });
      if (!token) {
        completing.current = false;
        setPhase({
          name: "error",
          context: ctx,
          message: "We couldn't confirm your session. Please try again.",
        });
        return;
      }
      const completed = await completeTransaction(tx, token, ctx.completion_token);
      if (completed.ok) {
        window.location.replace(buildRedirectUrl(completed.result));
        return;
      }
      completing.current = false;
      if (completed.error === "not_authorized_for_application") {
        setPhase({
          name: "error",
          context: ctx,
          message: `This account doesn't have access to ${ctx.display_name}.`,
        });
      } else if (completed.error === "reverification_required") {
        setPhase({
          name: "error",
          context: ctx,
          message: "For your security, please sign in again to continue.",
        });
      } else {
        // The completion token is single-use; reload the context so a retry
        // has a fresh one instead of dead-ending.
        setPhase({
          name: "error",
          context: ctx,
          message: "Sign-in couldn't be completed. Please try again.",
        });
      }
    },
    [getToken, tx]
  );

  // On arrival, clear any lingering central session so a login for THIS app
  // requires its own explicit authentication — a session for one app must
  // never silently grant another. This does not affect other apps' minted
  // session cookies, only the ephemeral Clerk session used during a ceremony.
  useEffect(() => {
    if (phase.name !== "ready" || !authLoaded || readyForAuth || clearing.current) return;
    if (isSignedIn) {
      clearing.current = true;
      void clerk.signOut().finally(() => setReadyForAuth(true));
    } else {
      setReadyForAuth(true);
    }
  }, [phase, authLoaded, isSignedIn, readyForAuth, clerk]);

  // Complete ONLY after a fresh authentication performed here (readyForAuth
  // means any pre-existing session was already cleared). Guarded to run once.
  useEffect(() => {
    if (phase.name !== "ready" || !readyForAuth) return;
    if (!isSignedIn || completing.current) return;
    completing.current = true;
    const ctx = phase.context;
    setPhase({ name: "completing", context: ctx });
    void finishWithSession(ctx);
  }, [phase, readyForAuth, isSignedIn, finishWithSession]);

  if (phase.name === "loading" || !authLoaded) {
    return (
      <Shell>
        <div className="flex flex-col items-center py-10 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="mt-3 text-sm">Preparing secure sign-in…</span>
        </div>
      </Shell>
    );
  }

  if (phase.name === "expired" || !context) {
    return <ExpiredState />;
  }

  if (phase.name === "completing") {
    return (
      <Shell>
        <div className="flex flex-col items-center py-10 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="mt-3 text-sm">Signing you in to {context.display_name}…</span>
        </div>
      </Shell>
    );
  }

  const hostname = (() => {
    try {
      return new URL(context.application_origin).hostname;
    } catch {
      return context.application_origin;
    }
  })();

  // Keep the tx handle across any full-page hop Clerk performs (OAuth), so the
  // return leg lands back on this exact ceremony and the session-watch
  // completes it.
  const returnUrl = `${window.location.origin}/login?tx=${encodeURIComponent(tx!)}`;

  return (
    <Shell>
      <div className="flex flex-col items-center text-center">
        <Wordmark appId={context.app_id} displayName={context.display_name} />
        <h1 className="mt-4 text-xl font-bold text-charcoal dark:text-white">
          {context.heading}
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          You are signing in to <span className="font-semibold">{context.display_name}</span>{" "}
          at <span className="font-mono text-slate-600 dark:text-slate-300">{hostname}</span>
        </p>
      </div>

      {phase.name === "error" && (
        <div className="mt-4 flex flex-col gap-2">
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          >
            {phase.message}
          </div>
          <button
            type="button"
            onClick={() => {
              completing.current = false;
              void loadContext();
            }}
            className="self-start text-sm font-medium text-seafoam-700 underline-offset-4 hover:underline dark:text-seafoam-400"
          >
            Try again
          </button>
        </div>
      )}

      {/* Render the auth form only after any lingering central session has
          been cleared, so it never auto-completes from another app's session. */}
      {!readyForAuth ? (
        <div className="mt-6 flex flex-col items-center py-8 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="mt-3 text-sm">Preparing secure sign-in…</span>
        </div>
      ) : (
        <>
          <div className="mt-5">
            {mode === "sign-in" ? (
              <SignIn
                routing="virtual"
                appearance={clerkAppearance}
                signUpUrl={returnUrl}
                forceRedirectUrl={returnUrl}
                fallbackRedirectUrl={returnUrl}
              />
            ) : (
              <SignUp
                routing="virtual"
                appearance={clerkAppearance}
                signInUrl={returnUrl}
                forceRedirectUrl={returnUrl}
                fallbackRedirectUrl={returnUrl}
              />
            )}
          </div>

      <div className="mt-4 text-center text-sm text-slate-500">
        {mode === "sign-in" ? (
          <>
            New to Sweepr?{" "}
            <button
              type="button"
              onClick={() => setMode("sign-up")}
              className="font-medium text-seafoam-700 hover:underline dark:text-seafoam-400"
            >
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("sign-in")}
              className="font-medium text-seafoam-700 hover:underline dark:text-seafoam-400"
            >
              Sign in
            </button>
          </>
        )}
      </div>
        </>
      )}

      <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
        By continuing, you agree to Sweepr's{" "}
        <a href={`${LEGAL_URL}/terms`} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-600 underline underline-offset-2 hover:text-charcoal dark:text-slate-300 dark:hover:text-white">Terms of Service</a>{" "}
        and acknowledge our{" "}
        <a href={`${LEGAL_URL}/privacy`} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-600 underline underline-offset-2 hover:text-charcoal dark:text-slate-300 dark:hover:text-white">Privacy Policy</a>.
      </p>

      <div className="mt-3 text-center">
        <a
          href={context.cancel_url}
          onClick={() => { if (clerk.session) void clerk.signOut(); }}
          className="text-sm font-medium text-slate-500 underline-offset-4 hover:text-charcoal hover:underline dark:hover:text-white"
        >
          Cancel and return to {hostname}
        </a>
      </div>
    </Shell>
  );
}
