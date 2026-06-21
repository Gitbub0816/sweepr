import { Routes, Route, Navigate } from "react-router-dom";
import { LegalShell } from "./components/LegalShell";
import { HomePage } from "./pages/HomePage";
import { TermsOfService } from "./pages/TermsOfService";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { EULA } from "./pages/EULA";
import { IndependentContractorAgreement } from "./pages/IndependentContractorAgreement";
import { SMSPolicy } from "./pages/SMSPolicy";
import { CookiePolicy } from "./pages/CookiePolicy";
import { RefundPolicy } from "./pages/RefundPolicy";
import { DisputeResolution } from "./pages/DisputeResolution";
import { Accessibility } from "./pages/Accessibility";

export default function App() {
  return (
    <LegalShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/eula" element={<EULA />} />
        <Route
          path="/contractor-agreement"
          element={<IndependentContractorAgreement />}
        />
        <Route path="/sms-policy" element={<SMSPolicy />} />
        <Route path="/cookie-policy" element={<CookiePolicy />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/dispute-resolution" element={<DisputeResolution />} />
        <Route path="/accessibility" element={<Accessibility />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LegalShell>
  );
}
