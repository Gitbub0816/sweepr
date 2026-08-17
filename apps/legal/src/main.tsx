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
import App from "./App";
import { installGlobalErrorHandlers, initAnalytics, initSiteTracker } from "@sweepr/ui";
import "./index.css";

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api.getsweepr.com";
installGlobalErrorHandlers({ app: "legal", apiUrl: API_URL });

// PostHog through the shared consent-gated wrapper. (The previous inline
// posthog.init here ran without a consent check AND was blocked by this
// app's CSP anyway — the shared path is both compliant and consistent.)
void initAnalytics();
// First-party site analytics (cookieless until analytics consent is granted).
initSiteTracker({ app: "legal" });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
