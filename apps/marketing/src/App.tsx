import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
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
        <Route path="/status" element={<StatusPage />} />
        <Route path="/privacy" element={<LegalRedirect slug="privacy" />} />
        <Route path="/terms" element={<LegalRedirect slug="terms" />} />
        <Route path="/independent-contractor" element={<LegalRedirect slug="contractor-agreement" />} />
      </Routes>
      <CookieConsent />
    </>
  );
}
