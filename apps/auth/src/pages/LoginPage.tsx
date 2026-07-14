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
import { useClerk } from "@clerk/clerk-react";
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
/** Marks an in-flight OAuth hop so the return leg may auto-complete the
 * ceremony. Clicking Google/Apple IS the explicit authentication action. */
const SSO_MARKER_KEY = "sweepr_sso_tx";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l4-3.09Z" />
      <path fill="#EA4335" d="M12 4.76c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.29 6.62l4 3.09C6.23 6.87 8.88 4.76 12 4.76Z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M16.36 12.76c.03 3.26 2.86 4.34 2.89 4.36-.02.08-.45 1.55-1.49 3.07-.9 1.31-1.83 2.61-3.3 2.64-1.44.03-1.91-.85-3.56-.85-1.65 0-2.17.82-3.53.88-1.42.05-2.5-1.42-3.4-2.72C2.11 17.46.71 12.6 2.6 9.33a5.27 5.27 0 0 1 4.45-2.7c1.39-.03 2.7.94 3.55.94.85 0 2.44-1.16 4.12-.99.7.03 2.66.28 3.92 2.13-.1.06-2.34 1.37-2.28 4.05ZM13.66 4.8c.75-.9 1.25-2.16 1.11-3.42-1.08.05-2.38.72-3.15 1.62-.69.8-1.3 2.08-1.13 3.3 1.2.1 2.42-.61 3.17-1.5Z" />
    </svg>
  );
}

type Phase =
  | { name: "loading" }
  | { name: "expired" }
  | { name: "ready"; context: TransactionContext }
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

/** The central sign-in ceremony.
 *
 * A live Clerk session is deliberately NOT sufficient: the broker refuses
 * Clerk tokens older than 120 seconds, so completing a login always requires
 * an explicit authentication action here, which mints a fresh token
 * (getToken({ skipCache: true }) after the action). */
export function LoginPage() {
  const [params] = useSearchParams();
  const tx = params.get("tx");
  const clerk = useClerk();

  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [busy, setBusy] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const loadedFor = useRef<string | null>(null);

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
    phase.name === "ready" || phase.name === "error" ? phase.context : null;

  useEffect(() => {
    if (context) document.title = `Sign in to ${context.display_name}`;
  }, [context]);

  /** Finish the ceremony with the Clerk session that exists right now. Used
   * by both password sign-in and the OAuth return leg. */
  const finishWithSession = useCallback(
    async (ctx: TransactionContext) => {
      if (!isValidHandle(tx)) return;
      const token = await clerk.session?.getToken({ skipCache: true });
      if (!token) {
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
      if (completed.error === "reverification_required") {
        setPhase({
          name: "error",
          context: ctx,
          message: "For your security, please sign in again to continue.",
        });
      } else if (completed.error === "not_authorized_for_application") {
        setPhase({
          name: "error",
          context: ctx,
          message: `This account doesn't have access to ${ctx.display_name}.`,
        });
      } else {
        setPhase({
          name: "error",
          context: ctx,
          message: "Sign-in couldn't be completed. Please try again.",
        });
      }
    },
    [clerk, tx]
  );

  // OAuth return leg: Clerk just created a session via Google/Apple. The
  // sessionStorage marker proves this browser started the hop for THIS
  // transaction (clicking the provider button was the explicit action), so
  // complete the ceremony without asking for a password.
  const ssoCompleting = useRef(false);
  useEffect(() => {
    if (phase.name !== "ready" || !isValidHandle(tx)) return;
    if (params.get("sso") !== "1" || ssoCompleting.current) return;
    let marker: string | null = null;
    try {
      marker = sessionStorage.getItem(SSO_MARKER_KEY);
      sessionStorage.removeItem(SSO_MARKER_KEY);
    } catch {
      /* storage unavailable: fall through to the password form */
    }
    if (marker !== tx || !clerk.session) return;
    ssoCompleting.current = true;
    setBusy(true);
    void finishWithSession(phase.context).finally(() => setBusy(false));
  }, [phase, params, tx, clerk.session, finishWithSession]);

  /** Kick off Google/Apple. Any lingering session is ended first so the
   * provider round-trip is a genuine fresh authentication. */
  const signInWithProvider = useCallback(
    async (strategy: "oauth_google" | "oauth_apple") => {
      if (!context || !isValidHandle(tx) || busy) return;
      setBusy(true);
      try {
        if (clerk.session) await clerk.signOut();
        try {
          sessionStorage.setItem(SSO_MARKER_KEY, tx);
        } catch {
          /* storage unavailable: return leg will show the password form */
        }
        await clerk.client?.signIn.authenticateWithRedirect({
          strategy,
          redirectUrl: `${window.location.origin}/login/sso-callback`,
          redirectUrlComplete: `${window.location.origin}/login?tx=${encodeURIComponent(tx)}&sso=1`,
        });
      } catch {
        setBusy(false);
        setPhase({
          name: "error",
          context,
          message: "That sign-in method isn't available right now. Please use your email and password.",
        });
      }
    },
    [busy, clerk, context, tx]
  );

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!context || !isValidHandle(tx) || busy) return;
      setBusy(true);
      try {
        // Explicit ceremony: an existing Clerk session must never complete a
        // login on its own. If one lingers, end it first so the sign-in below
        // is a genuine fresh authentication with a fresh token iat.
        if (clerk.session) {
          await clerk.signOut();
        }
        const signIn = await clerk.client?.signIn.create({
          identifier: identifier.trim(),
          password,
        });
        if (!signIn || signIn.status !== "complete" || !signIn.createdSessionId) {
          setPhase({
            name: "error",
            context,
            message:
              "This account needs additional verification that isn't supported here yet. Please contact support.",
          });
          return;
        }
        await clerk.setActive({ session: signIn.createdSessionId });
        await finishWithSession(context);
      } catch (err: unknown) {
        const clerkMessage =
          (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message;
        setPhase({
          name: "error",
          context,
          message: clerkMessage || "Incorrect email or password. Please try again.",
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, clerk, context, identifier, password, tx, finishWithSession]
  );

  if (phase.name === "loading") {
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

  const hostname = (() => {
    try {
      return new URL(context.application_origin).hostname;
    } catch {
      return context.application_origin;
    }
  })();
  const formId = `sweepr-${context.app_id}-sign-in`;

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
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
        >
          {phase.message}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void signInWithProvider("oauth_google")}
          className="inline-flex h-10 items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-charcoal transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-900"
        >
          <GoogleMark />
          Continue with Google
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void signInWithProvider("oauth_apple")}
          className="inline-flex h-10 items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-charcoal transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-900"
        >
          <AppleMark />
          Continue with Apple
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">or</span>
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>

      <form
        id={formId}
        aria-label={`Sign in to ${context.display_name}`}
        className="mt-4 flex flex-col gap-3"
        onSubmit={submit}
      >
        <label className="text-left text-sm font-medium text-slate-700 dark:text-slate-300">
          Email
          <input
            type="email"
            name="email"
            required
            autoFocus
            autoComplete={`${context.autocomplete_section} username`}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-base text-charcoal shadow-sm placeholder:text-slate-400 focus:border-seafoam-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            placeholder="you@example.com"
          />
        </label>
        <label className="text-left text-sm font-medium text-slate-700 dark:text-slate-300">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete={`${context.autocomplete_section} current-password`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-base text-charcoal shadow-sm placeholder:text-slate-400 focus:border-seafoam-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            placeholder="••••••••"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="mt-1 inline-flex h-10 items-center justify-center rounded-xl bg-charcoal text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Sign in to ${context.display_name}`}
        </button>
      </form>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
        By continuing, you agree to Sweepr's{" "}
        <a
          href={`${LEGAL_URL}/terms`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-slate-600 underline underline-offset-2 hover:text-charcoal dark:text-slate-300 dark:hover:text-white"
        >
          Terms of Service
        </a>{" "}
        and acknowledge our{" "}
        <a
          href={`${LEGAL_URL}/privacy`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-slate-600 underline underline-offset-2 hover:text-charcoal dark:text-slate-300 dark:hover:text-white"
        >
          Privacy Policy
        </a>
        .
      </p>

      <div className="mt-3 text-center">
        <a
          href={context.cancel_url}
          className="text-sm font-medium text-slate-500 underline-offset-4 hover:text-charcoal hover:underline dark:hover:text-white"
        >
          Cancel and return to {hostname}
        </a>
      </div>
    </Shell>
  );
}
