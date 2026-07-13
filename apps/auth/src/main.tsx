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
import { ErrorBoundary } from "@sweepr/ui";
import App from "./App";
import { AlmostReady } from "./components/AlmostReady";
import { CLERK_ENABLED, CLERK_PUBLISHABLE_KEY } from "./clerk";
import "./index.css";

function Root() {
  // Without a Clerk publishable key the ceremony cannot run — render a
  // graceful landing state instead of crashing; ClerkProvider (and any Clerk
  // hooks) must never mount without a key.
  if (!CLERK_ENABLED) {
    return (
      <BrowserRouter>
        <AlmostReady />
      </BrowserRouter>
    );
  }
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY!}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
);
