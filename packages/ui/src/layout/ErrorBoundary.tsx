/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

export type ErrorVariant = "playful" | "literal";
export type AppName = "admin" | "customer" | "cleaner" | "marketing" | "service" | "legal" | "status";

interface ReportOpts {
  app?: AppName;
  apiUrl?: string;
  level?: "error" | "warn" | "fatal";
  componentStack?: string;
  context?: Record<string, unknown>;
}

/**
 * Best-effort: ship a client error to the admin error feed. Never throws and
 * does nothing unless both `app` and `apiUrl` are provided. Resolves with the
 * customer-visible `reference` code the API hands back (e.g. "ERR-AB12CD34")
 * so the UI can show it in fine print — or `undefined` if reporting failed.
 */
export async function reportClientError(
  error: unknown,
  { app, apiUrl, level = "error", componentStack, context }: ReportOpts,
): Promise<string | undefined> {
  if (!app || !apiUrl || typeof fetch === "undefined") return undefined;
  try {
    const err = error as { message?: string; stack?: string };
    const message =
      (err && err.message) || (typeof error === "string" ? error : "Unknown client error");
    const res = await fetch(`${apiUrl}/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        app,
        level,
        message: String(message).slice(0, 2000),
        stack: err?.stack ? String(err.stack).slice(0, 8000) : undefined,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
        componentStack: componentStack ? String(componentStack).slice(0, 4000) : undefined,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        viewport:
          typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : undefined,
        language: typeof navigator !== "undefined" ? navigator.language : undefined,
        online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
        context,
      }),
    });
    if (!res.ok) return undefined;
    const data = (await res.json().catch(() => null)) as { reference?: string } | null;
    return data?.reference;
  } catch {
    /* never let reporting break the app */
    return undefined;
  }
}

interface Props {
  children: ReactNode;
  /** Which app this boundary protects — enables reporting + tailors copy. */
  app?: AppName;
  /** API base URL for reporting (e.g. import.meta.env.VITE_API_URL). */
  apiUrl?: string;
  /**
   * "playful" (default) for customer/cleaner/marketing — friendly, light copy.
   * "literal" for admin/internal — shows the actual message and stack.
   */
  variant?: ErrorVariant;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  reference: string | null;
}

// Playful lines for customer/cleaner-facing screens. Tell them something broke,
// but keep it light and on-brand — never expose the literal error.
const PLAYFUL = [
  {
    emoji: "🧹",
    title: "Whoops, we made a mess",
    body: "Something didn't sweep up right on our end. Give it a reload and we'll have things spotless in a jiffy.",
  },
  {
    emoji: "🫧",
    title: "That wasn't squeaky clean",
    body: "We hit a little dust bunny. A quick refresh usually clears it right up.",
  },
  {
    emoji: "🧼",
    title: "We slipped on a wet floor",
    body: "Our app took a tumble. Reload to get us back on our feet, your progress is safe.",
  },
];

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, reference: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, reference: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error:", error, info);
    void reportClientError(error, {
      app: this.props.app,
      apiUrl: this.props.apiUrl,
      componentStack: info.componentStack ?? undefined,
    }).then((reference) => {
      if (reference) this.setState({ reference });
    });
  }

  /** "Try again" — reset the boundary so React re-attempts rendering the
   * subtree without a full page reload. If the error persists it will simply
   * re-trip the boundary. */
  reset = () => {
    this.setState({ hasError: false, error: null, reference: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const literal = this.props.variant === "literal";

    if (literal) {
      const err = this.state.error;
      return (
        <div
          role="alert"
          className="flex min-h-screen flex-col items-center justify-center bg-offwhite px-6 py-10 dark:bg-slate-950"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900/40 dark:bg-slate-900">
            <h1 className="text-lg font-bold text-red-700 dark:text-red-400">
              Unhandled error in the UI
            </h1>
            <p className="mt-2 text-sm font-medium text-charcoal dark:text-white">
              {err?.message ?? "Unknown error"}
            </p>
            {err?.stack && (
              <pre className="mt-4 max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-300">
                {err.stack}
              </pre>
            )}
            <p className="mt-4 text-xs text-slate-400">
              This error was logged to Observability → Errors.
              {this.state.reference && (
                <>
                  {" "}Reference: <span className="font-mono">{this.state.reference}</span>
                </>
              )}
            </p>
            <button
              type="button"
              onClick={this.reset}
              className="mt-6 rounded-xl bg-seafoam-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-seafoam-800"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    const pick = PLAYFUL[Math.floor(Math.random() * PLAYFUL.length)];
    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center bg-offwhite px-6 text-center dark:bg-slate-950"
      >
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-seafoam-50 text-3xl dark:bg-seafoam-900/20">
          {pick.emoji}
        </div>
        <h1 className="text-2xl font-black text-charcoal dark:text-white">
          {pick.title}
        </h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {pick.body} It's not you, it's us.
        </p>
        {import.meta.env.DEV && this.state.error?.message && (
          <p className="mt-3 max-w-sm break-words rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            (dev only) {this.state.error.message}
          </p>
        )}
        <button
          type="button"
          onClick={this.reset}
          className="mt-6 rounded-2xl bg-seafoam-700 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-seafoam-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500 focus-visible:ring-offset-2"
        >
          Try again
        </button>
        {this.state.reference && (
          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
            Reference: <span className="font-mono">{this.state.reference}</span>
          </p>
        )}
      </div>
    );
  }
}

/**
 * Install a global handler for unhandled promise rejections. Call once at
 * startup. Pass { app, apiUrl } to also report rejections to the admin feed.
 */
export function installGlobalErrorHandlers(opts: ReportOpts = {}) {
  if (typeof window === "undefined") return;
  window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", event.reason);
    void reportClientError(event.reason, { ...opts, level: "warn" });
  });
  window.addEventListener("error", (event) => {
    void reportClientError(event.error ?? event.message, { ...opts });
  });
}
