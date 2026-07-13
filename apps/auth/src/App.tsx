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
import { Routes, Route } from "react-router-dom";
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
      <Route path="*" element={<MarketingRedirect />} />
    </Routes>
  );
}
