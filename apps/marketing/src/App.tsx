/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import { CookieConsent } from "./components/CookieConsent";
import { PromoHost } from "@sweepr/ui";

// Landing is the only route that needs to be in the initial bundle (it's
// what every marketing visitor hits first). Every other page is
// code-split so its JS is only fetched when a visitor navigates there.
const CleanWithUs = lazy(() => import("./pages/CleanWithUs"));
const StatusPage = lazy(() => import("./pages/StatusPage"));
const PrivacyRequestPage = lazy(() => import("./pages/PrivacyRequestPage"));
const AccessibilityPage = lazy(() => import("./pages/AccessibilityPage"));
const PromoPage = lazy(() => import("./pages/PromoPage"));

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api.getsweepr.com";

function LegalRedirect({ slug }: { slug: string }) {
  window.location.replace(`https://legal.getsweepr.com/${slug}?ref=marketing`);
  return null;
}

export default function App() {
  return (
    <>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/clean-with-us" element={<CleanWithUs />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/privacy" element={<LegalRedirect slug="privacy" />} />
          <Route path="/privacy-request" element={<PrivacyRequestPage />} />
          <Route path="/accessibility" element={<AccessibilityPage />} />
          <Route path="/promo/:slug" element={<PromoPage />} />
          <Route path="/terms" element={<LegalRedirect slug="terms" />} />
          <Route path="/independent-contractor" element={<LegalRedirect slug="contractor-agreement" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <PromoHost apiBase={API_URL} persona="visitor" />
      <CookieConsent />
    </>
  );
}
