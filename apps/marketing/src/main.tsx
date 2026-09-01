/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ErrorBoundary, installGlobalErrorHandlers, initAnalytics, initSiteTracker } from "@sweepr/ui";
import App from "./App";
import "./index.css";
import "./i18n";
import { initAnalyticsIfConsented } from "./lib/consentGate";

// GDPR/CCPA: only start PostHog (autocapture + session recording) once the
// visitor has opted in via the cookie banner, or honors an existing consent
// record that already granted analytics. Deferred to idle so it never
// competes with the initial render for main-thread time — see
// src/lib/consentGate.ts.
const scheduleIdle =
  typeof window !== "undefined" && "requestIdleCallback" in window
    ? window.requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 1);
scheduleIdle(() => void initAnalyticsIfConsented(initAnalytics));

// First-party site analytics (our own pipeline → admin Site Analytics).
// Self-gating: cookieless/tab-scoped until the visitor grants analytics
// consent, at which point it upgrades to first-party swa_* cookies.
initSiteTracker({ app: "marketing" });

// Clerk is only needed for the auth controls in the nav (see
// MarketingAuth.tsx / ClerkAuthControls.tsx), which lazy-load
// @clerk/clerk-react and own their own ClerkProvider. The app root no
// longer eagerly wraps the tree in ClerkProvider, so the landing page's
// initial JS payload ships zero Clerk code.
function Root() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

// Fall back to the production API in prod builds so error reporting still
// works when VITE_API_URL is missing from the build environment.
const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.PROD ? "https://api.getsweepr.com" : "");

installGlobalErrorHandlers({ app: "marketing", apiUrl: API_URL });

// Activate the Inter stylesheet (loaded with media=print in index.html so it
// never blocks first paint). Done here instead of an inline onload attribute,
// which the CSP blocks (script-src has no 'unsafe-inline'/'unsafe-hashes').
const interCss = document.getElementById("inter-font-css") as HTMLLinkElement | null;
if (interCss) interCss.media = "all";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary app="marketing" apiUrl={API_URL} variant="playful">
    <Root />
      </ErrorBoundary>
  </React.StrictMode>
);
