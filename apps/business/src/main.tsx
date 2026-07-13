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
import "./index.css";

function Root() {
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* No `app` prop: @sweepr/ui's AppName union doesn't include "business"
        yet — the boundary still renders a friendly fallback without it. */}
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
);
