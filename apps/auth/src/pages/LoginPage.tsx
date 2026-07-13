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
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-offwhite to-seafoam-50 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {children}
      </div>
      <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5" />
        Secured by Sweepr central sign-in
      </p>
    </div>
  );
}

function ExpiredState() {
  return (
    <Shell>
      <div className="flex flex-col items-center text-center">
        <SweeprLogo size="md" />
        <h1 className="mt-6 text-xl font-bold text-charcoal dark:text-white">
          This sign-in link has expired
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign-in links are only valid for a few minutes. Return to the app you
          were signing in to and try again.
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

        // Fresh token for the just-minted session (broker enforces iat ≤ 120s).
        const token = await clerk.session?.getToken({ skipCache: true });
        if (!token) {
          setPhase({
            name: "error",
            context,
            message: "We couldn't confirm your session. Please try again.",
          });
          return;
        }

        const completed = await completeTransaction(tx, token, context.completion_token);
        if (completed.ok) {
          window.location.replace(buildRedirectUrl(completed.result));
          return;
        }
        if (completed.error === "reverification_required") {
          setPhase({
            name: "error",
            context,
            message: "For your security, please sign in again to continue.",
          });
        } else if (completed.error === "not_authorized_for_application") {
          setPhase({
            name: "error",
            context,
            message: `This account doesn't have access to ${context.display_name}.`,
          });
        } else {
          setPhase({
            name: "error",
            context,
            message: "Sign-in couldn't be completed. Please try again.",
          });
        }
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
    [busy, clerk, context, identifier, password, tx]
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
        <h1 className="mt-6 text-xl font-bold text-charcoal dark:text-white">
          {context.heading}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          You are signing in to <span className="font-semibold">{context.display_name}</span>{" "}
          at <span className="font-mono text-slate-600 dark:text-slate-300">{hostname}</span>
        </p>
      </div>

      {phase.name === "error" && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
        >
          {phase.message}
        </div>
      )}

      <form
        id={formId}
        aria-label={`Sign in to ${context.display_name}`}
        className="mt-6 flex flex-col gap-4"
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
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-charcoal shadow-sm placeholder:text-slate-400 focus:border-seafoam-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
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
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-charcoal shadow-sm placeholder:text-slate-400 focus:border-seafoam-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            placeholder="••••••••"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-charcoal text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Sign in to ${context.display_name}`}
        </button>
      </form>

      <div className="mt-6 text-center">
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
