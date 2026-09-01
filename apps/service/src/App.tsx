/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Routes, Route, Navigate } from "react-router";
import { DemoLanding } from "./pages/DemoLanding";
import { CleanerView } from "./pages/CleanerView";
import { CustomerView } from "./pages/CustomerView";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DemoLanding />} />
      {/* Existing realtime two-persona sandbox, untouched */}
      <Route path="/u1/t/:txId" element={<CleanerView />} />
      <Route path="/u2/t/:txId" element={<CustomerView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
