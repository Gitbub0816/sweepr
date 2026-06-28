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
// New legal pages (DRAFT — see SWEEPR_LEGAL_WHATS_MISSING.md).
import { ESignConsent } from "./pages/ESignConsent";
import { CustomerAgreement } from "./pages/CustomerAgreement";
import { ServiceScopePolicy } from "./pages/ServiceScopePolicy";
import { DamageClaimsPolicy } from "./pages/DamageClaimsPolicy";
import { SubscriptionTerms } from "./pages/SubscriptionTerms";
import { CleanerPlatformAgreement } from "./pages/CleanerPlatformAgreement";
import { BackgroundCheckDisclosure } from "./pages/BackgroundCheckDisclosure";
import { BackgroundCheckAuthorization } from "./pages/BackgroundCheckAuthorization";
import { BackgroundCheckAdverseAction } from "./pages/BackgroundCheckAdverseAction";
import { PaymentServicesTerms } from "./pages/PaymentServicesTerms";
import { PlatformFeePolicy } from "./pages/PlatformFeePolicy";
import { TaxReportingPolicy } from "./pages/TaxReportingPolicy";
import { TrustSafetyPolicy } from "./pages/TrustSafetyPolicy";
import { CommunityGuidelines } from "./pages/CommunityGuidelines";
import { ReviewPolicy } from "./pages/ReviewPolicy";
import { AcceptableUsePolicy } from "./pages/AcceptableUsePolicy";
import { InsuranceProtectionPolicy } from "./pages/InsuranceProtectionPolicy";
import { NoticeAtCollection } from "./pages/NoticeAtCollection";
import { Subprocessors } from "./pages/Subprocessors";
import { DataProcessingAddendum } from "./pages/DataProcessingAddendum";
import { SecurityPolicy } from "./pages/SecurityPolicy";
import { AIDisclosure } from "./pages/AIDisclosure";
import { LegalUpdatesPolicy } from "./pages/LegalUpdatesPolicy";
import { CopyrightPolicy } from "./pages/CopyrightPolicy";
import { VulnerabilityDisclosurePolicy } from "./pages/VulnerabilityDisclosurePolicy";
import { LawEnforcementRequests } from "./pages/LawEnforcementRequests";

export default function App() {
  return (
    <LegalShell>
      <Routes>
        <Route path="/" element={<HomePage />} />

        {/* Core */}
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/eula" element={<EULA />} />
        <Route path="/dispute-resolution" element={<DisputeResolution />} />
        <Route path="/accessibility" element={<Accessibility />} />
        <Route path="/e-sign" element={<ESignConsent />} />

        {/* Customers */}
        <Route path="/customer-agreement" element={<CustomerAgreement />} />
        <Route path="/service-scope" element={<ServiceScopePolicy />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/damage-claims" element={<DamageClaimsPolicy />} />
        <Route path="/subscription-terms" element={<SubscriptionTerms />} />

        {/* Cleaners */}
        <Route path="/cleaner-agreement" element={<CleanerPlatformAgreement />} />
        <Route
          path="/contractor-agreement"
          element={<IndependentContractorAgreement />}
        />
        <Route
          path="/background-check-disclosure"
          element={<BackgroundCheckDisclosure />}
        />
        <Route
          path="/background-check-authorization"
          element={<BackgroundCheckAuthorization />}
        />
        <Route
          path="/background-check-adverse-action"
          element={<BackgroundCheckAdverseAction />}
        />

        {/* Payments & Tax */}
        <Route path="/payment-terms" element={<PaymentServicesTerms />} />
        <Route path="/platform-fee-policy" element={<PlatformFeePolicy />} />
        <Route path="/tax-reporting" element={<TaxReportingPolicy />} />

        {/* Trust & Safety */}
        <Route path="/trust-safety" element={<TrustSafetyPolicy />} />
        <Route path="/community-guidelines" element={<CommunityGuidelines />} />
        <Route path="/reviews" element={<ReviewPolicy />} />
        <Route path="/acceptable-use" element={<AcceptableUsePolicy />} />
        <Route path="/insurance-protection" element={<InsuranceProtectionPolicy />} />

        {/* Privacy & Data */}
        <Route
          path="/privacy-notice-at-collection"
          element={<NoticeAtCollection />}
        />
        <Route path="/cookie-policy" element={<CookiePolicy />} />
        <Route path="/subprocessors" element={<Subprocessors />} />
        <Route path="/dpa" element={<DataProcessingAddendum />} />
        <Route path="/security" element={<SecurityPolicy />} />
        <Route path="/ai-disclosure" element={<AIDisclosure />} />

        {/* Platform Policies */}
        <Route path="/sms-policy" element={<SMSPolicy />} />
        <Route path="/legal-updates" element={<LegalUpdatesPolicy />} />
        <Route path="/copyright" element={<CopyrightPolicy />} />
        <Route
          path="/vulnerability-disclosure"
          element={<VulnerabilityDisclosurePolicy />}
        />
        <Route path="/law-enforcement" element={<LawEnforcementRequests />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LegalShell>
  );
}
