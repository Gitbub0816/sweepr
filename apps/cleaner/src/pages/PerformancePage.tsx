/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Navigate } from "react-router";

/**
 * The standalone /performance page previously rendered hardcoded fake stats and
 * reviews to every cleaner. The real, DB-backed performance view lives in the
 * dashboard's Performance tab (/cleaner-dashboard/performance-stats), so
 * redirect there — a single, real source of truth (no mock data).
 */
export function PerformancePage() {
  return <Navigate to="/?tab=performance" replace />;
}
