/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Routes, Route, Navigate } from "react-router-dom";
import { DemoLanding } from "./pages/DemoLanding";
import { CleanerView } from "./pages/CleanerView";
import { CustomerView } from "./pages/CustomerView";
import { BookFlow } from "./flows/BookFlow";
import { ManageFlow } from "./flows/ManageFlow";
import { OnboardingFlow } from "./flows/OnboardingFlow";
import { DayOfServiceFlow } from "./flows/DayOfServiceFlow";
import { AdminReviewFlow } from "./flows/AdminReviewFlow";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DemoLanding />} />
      <Route path="/demo/book" element={<BookFlow />} />
      <Route path="/demo/manage" element={<ManageFlow />} />
      <Route path="/demo/onboarding" element={<OnboardingFlow />} />
      <Route path="/demo/day-of-service" element={<DayOfServiceFlow />} />
      <Route path="/demo/admin-review" element={<AdminReviewFlow />} />
      {/* Existing realtime two-persona sandbox, untouched */}
      <Route path="/u1/t/:txId" element={<CleanerView />} />
      <Route path="/u2/t/:txId" element={<CustomerView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
