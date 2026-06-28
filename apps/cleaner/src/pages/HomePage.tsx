import { Navigate } from "react-router-dom";

/**
 * The real dashboard lives at "/" (DashboardPage). This legacy route just
 * redirects there so there's a single, real source of truth (no mock data).
 */
export function HomePage() {
  return <Navigate to="/" replace />;
}
