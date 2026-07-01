import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import CleanWithUs from "./pages/CleanWithUs";
import StatusPage from "./pages/StatusPage";
import { CookieConsent } from "./components/CookieConsent";

function LegalRedirect({ slug }: { slug: string }) {
  window.location.replace(`https://legal.getsweepr.com/${slug}?ref=marketing`);
  return null;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/clean-with-us" element={<CleanWithUs />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/privacy" element={<LegalRedirect slug="privacy" />} />
        <Route path="/terms" element={<LegalRedirect slug="terms" />} />
        <Route path="/independent-contractor" element={<LegalRedirect slug="contractor-agreement" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CookieConsent />
    </>
  );
}
