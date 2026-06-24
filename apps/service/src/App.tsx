import { Routes, Route, Navigate } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { CleanerView } from "./pages/CleanerView";
import { CustomerView } from "./pages/CustomerView";

const SEED_ENABLED = import.meta.env.VITE_SEED_BOOL === "true";

function Disabled() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="rounded-xl bg-white p-10 shadow text-center max-w-sm">
        <p className="text-2xl mb-2">🔒</p>
        <h1 className="text-lg font-bold text-charcoal mb-1">Demo not enabled</h1>
        <p className="text-sm text-slate-500">Set VITE_SEED_BOOL=true and redeploy to use the day-of-service demo.</p>
      </div>
    </div>
  );
}

export default function App() {
  if (!SEED_ENABLED) return <Disabled />;

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/u1/t/:txId" element={<CleanerView />} />
      <Route path="/u2/t/:txId" element={<CustomerView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
