import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { ErrorBoundary, installGlobalErrorHandlers } from "@sweepr/ui";
import App from "./App";
import "./index.css";

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

installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
    <Root />
      </ErrorBoundary>
  </React.StrictMode>
);
