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
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { ToastProvider, ErrorBoundary } from "@sweepr/ui";
import App from "./App";
import { AlmostReady } from "./components/AlmostReady";
import { CLERK_ENABLED, CLERK_PUBLISHABLE_KEY } from "./clerk";
import { CENTRAL_AUTH_ENABLED } from "./components/CentralSession";
import "./index.css";

function Root() {
  // Central-auth mode: authentication lives ENTIRELY on the auth page
  // (auth.getsweepr.com) via the broker. The business app must NOT load Clerk
  // here — mounting ClerkProvider would pull clerk-js from the business Clerk
  // domain (and hang if that domain isn't provisioned). The SessionProvider
  // in App.tsx gates pages and redirects unauthenticated users to /auth/login.
  if (CENTRAL_AUTH_ENABLED) {
    return (
      <BrowserRouter>
        <App />
        <ToastProvider />
      </BrowserRouter>
    );
  }

  // The business Clerk application may not be provisioned yet. Without a
  // publishable key we render a graceful landing state instead of crashing —
  // ClerkProvider (and any Clerk hooks) must never mount without a key.
  if (!CLERK_ENABLED) {
    return (
      <BrowserRouter>
        <AlmostReady />
      </BrowserRouter>
    );
  }
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY!}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      afterSignOutUrl="/sign-in"
    >
      <BrowserRouter>
        <App />
        <ToastProvider />
      </BrowserRouter>
    </ClerkProvider>
  );
}

// Fall back to the production API in prod builds so error reporting still
// works when VITE_API_URL is missing from the build environment.
const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.PROD ? "https://api.getsweepr.com" : "");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary app="business" apiUrl={API_URL} variant="literal">
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
);
