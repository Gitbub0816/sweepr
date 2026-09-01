/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect } from "react";
import { Routes, Route } from "react-router";
import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import { LoginPage } from "./pages/LoginPage";

/** Anything that isn't the sign-in ceremony goes to the marketing site —
 * this origin serves exactly one purpose. */
function MarketingRedirect() {
  useEffect(() => {
    window.location.replace("https://getsweepr.com");
  }, []);
  return null;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Clerk lands here mid-OAuth (Google/Apple) to finish its handshake,
          then forwards to the redirectUrlComplete we set at kickoff. */}
      <Route path="/login/sso-callback" element={<AuthenticateWithRedirectCallback />} />
      <Route path="*" element={<MarketingRedirect />} />
    </Routes>
  );
}
