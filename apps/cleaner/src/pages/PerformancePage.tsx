import { Navigate } from "react-router-dom";

/**
 * The standalone /performance page previously rendered hardcoded fake stats and
 * reviews to every cleaner. The real, DB-backed performance view lives in the
 * dashboard's Performance tab (/cleaner-dashboard/performance-stats), so
 * redirect there — a single, real source of truth (no mock data).
 */
export function PerformancePage() {
  return <Navigate to="/?tab=performance" replace />;
}
