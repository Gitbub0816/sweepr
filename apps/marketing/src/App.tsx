import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import IndependentContractorDisclosure from "./pages/IndependentContractorDisclosure";
import { CookieConsent } from "./components/CookieConsent";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
        <Route
          path="/independent-contractor"
          element={<IndependentContractorDisclosure />}
        />
      </Routes>
      <CookieConsent />
    </>
  );
}
