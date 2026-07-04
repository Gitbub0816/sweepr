import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/clerk-react";
import { ToastProvider, ErrorBoundary, installGlobalErrorHandlers, initAnalytics } from "@sweepr/ui";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.2,
    // Never capture PII
    beforeSend(event) {
      if (event.request?.cookies) delete event.request.cookies;
      return event;
    },
  });
}

initAnalytics();

const queryClient = new QueryClient();
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

function Providers({ children }: { children: React.ReactNode }) {
  const tree = (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
        <ToastProvider />
      </BrowserRouter>
    </QueryClientProvider>
  );
  // Only mount Clerk when a key is present so keyless dev/preview builds work.
  if (!PUBLISHABLE_KEY) return tree;
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      signInUrl="/sign-in"
      signInFallbackRedirectUrl="/"
      afterSignOutUrl="/sign-in"
    >
      {tree}
    </ClerkProvider>
  );
}

// Fall back to the production API in prod builds so error reporting still
// works when VITE_API_URL is missing from the build environment.
const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.PROD ? "https://api.getsweepr.com" : "");

installGlobalErrorHandlers({ app: "admin", apiUrl: API_URL });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary app="admin" apiUrl={API_URL} variant="literal">
    <Providers>
      <App />
    </Providers>
      </ErrorBoundary>
  </React.StrictMode>
);
