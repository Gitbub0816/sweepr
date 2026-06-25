import { Routes, Route, Navigate } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { CleanerView } from "./pages/CleanerView";
import { CustomerView } from "./pages/CustomerView";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/u1/t/:txId" element={<CleanerView />} />
      <Route path="/u2/t/:txId" element={<CustomerView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
