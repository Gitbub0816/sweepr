import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { ErrorBoundary, installGlobalErrorHandlers, initAnalytics } from "@sweepr/ui";
import App from "./App";
import "./index.css";

initAnalytics();

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

// Clerk is optional on the marketing site — only wrap when a key is configured
// so local/preview builds without keys still render.
function Root() {
  const tree = (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
  if (!PUBLISHABLE_KEY) return tree;
  return <ClerkProvider publishableKey={PUBLISHABLE_KEY}>{tree}</ClerkProvider>;
}

const API_URL = (import.meta.env.VITE_API_URL as string) ?? "";

installGlobalErrorHandlers({ app: "marketing", apiUrl: API_URL });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary app="marketing" apiUrl={API_URL} variant="playful">
    <Root />
      </ErrorBoundary>
  </React.StrictMode>
);
