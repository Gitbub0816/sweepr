import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { COMPANY_NAME, PRIVACY_EMAIL } from "../docs";

const toc = [
  { id: "intro", title: "Introduction" },
  { id: "data", title: "Data We Collect" },
  { id: "use", title: "How We Use Data" },
  { id: "subprocessors", title: "Subprocessors" },
  { id: "ccpa", title: "Your CCPA Rights" },
  { id: "gdpr", title: "Your GDPR Rights" },
  { id: "retention", title: "Data Retention" },
  { id: "transfers", title: "International Transfers" },
  { id: "sale", title: "Sale of Personal Information" },
  { id: "security", title: "Security" },
  { id: "contact", title: "Contact" },
];

export function PrivacyPolicy() {
  return (
    <DocPage
      title="Privacy Policy"
      intro={`${COMPANY_NAME} ("Sweepr") respects your privacy. This Privacy Policy explains what information we collect, how we use it, and the rights you have under the California Consumer Privacy Act (CCPA) and the EU General Data Protection Regulation (GDPR).`}
      toc={toc}
    >
      <Section id="intro" title="1. Introduction">
        <p>
          This policy applies to personal information we process about customers,
          cleaners, and website visitors. By using the Platform, you acknowledge
          the practices described here.
        </p>
      </Section>

      <Section id="data" title="2. Data We Collect">
        <ul className="list-disc space-y-1 pl-6">
          <li>Identity data: name, email, phone number;</li>
          <li>Account data: authentication identifiers (via Clerk);</li>
          <li>Booking data: home details, service preferences, notes;</li>
          <li>Location data: service addresses and approximate coordinates;</li>
          <li>
            Payment data: tokenized payment methods and transaction history (via
            Stripe); we do not store full card numbers;
          </li>
          <li>
            Cleaner verification data: background-check status and identity
            verification references (via Checkr and Didit);
          </li>
          <li>Communications: SMS, email, and in-app messages;</li>
          <li>
            Technical data: IP address, device and browser information, and usage
            logs.
          </li>
        </ul>
      </Section>

      <Section id="use" title="3. How We Use Data">
        <p>We use personal information to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Provide, operate, and improve the Platform;</li>
          <li>Match customers with cleaners and process bookings;</li>
          <li>Process payments and prevent fraud;</li>
          <li>Communicate with you about your bookings and account;</li>
          <li>Comply with legal obligations.</li>
        </ul>
      </Section>

      <Section id="subprocessors" title="4. Subprocessors">
        <p>
          We rely on the following service providers, who process personal data
          on our behalf under contract:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Clerk — authentication and identity management;</li>
          <li>Stripe — payment processing;</li>
          <li>Checkr — background checks;</li>
          <li>Didit — identity verification;</li>
          <li>Neon — database hosting;</li>
          <li>Firebase — notifications and supporting services;</li>
          <li>Cloudflare — hosting, CDN, and security;</li>
          <li>MailerSend — transactional email;</li>
          <li>Mapbox — maps and geocoding;</li>
          <li>Twilio — SMS delivery.</li>
        </ul>
      </Section>

      <Section id="ccpa" title="5. Your CCPA Rights (California Residents)">
        <p>
          Under the California Consumer Privacy Act (Cal. Civ. Code § 1798.100
          et seq.), California residents have the right to:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Know what personal information we collect and how we use it;</li>
          <li>Request deletion of personal information;</li>
          <li>Opt out of the "sale" or "sharing" of personal information;</li>
          <li>
            Non-discrimination for exercising your privacy rights.
          </li>
        </ul>
      </Section>

      <Section id="gdpr" title="6. Your GDPR Rights (EEA / UK Residents)">
        <p>
          Under the GDPR (Articles 13 and 14 inform this disclosure), you have
          all of the following rights:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>The right to be informed;</li>
          <li>The right of access;</li>
          <li>The right to rectification;</li>
          <li>The right to erasure ("right to be forgotten");</li>
          <li>The right to restrict processing;</li>
          <li>The right to data portability;</li>
          <li>The right to object;</li>
          <li>
            Rights related to automated decision-making and profiling.
          </li>
        </ul>
      </Section>

      <Section id="retention" title="7. Data Retention">
        <ul className="list-disc space-y-1 pl-6">
          <li>Financial records: 7 years (legal/tax requirements);</li>
          <li>Account data: 3 years after the account becomes inactive;</li>
          <li>Logs: 2 years;</li>
          <li>
            Background-check references: duration of the contractor relationship
            plus 2 years.
          </li>
        </ul>
      </Section>

      <Section id="transfers" title="8. International Transfers">
        <p>
          Where personal data is transferred outside the EEA or UK, we rely on
          Standard Contractual Clauses (SCCs) approved by the European
          Commission and other appropriate safeguards.
        </p>
      </Section>

      <Section id="sale" title="9. Sale of Personal Information">
        <p>
          <strong>We do not sell your personal information.</strong> We also do
          not "share" personal information for cross-context behavioral
          advertising as those terms are defined under the CCPA.
        </p>
      </Section>

      <Section id="security" title="10. Security">
        <p>
          We implement technical and organizational measures to protect personal
          information, including encryption in transit, access controls, and
          tokenization of payment data. No system is perfectly secure, and we
          cannot guarantee absolute security.
        </p>
      </Section>

      <Section id="contact" title="11. Contact">
        <p>
          To exercise your rights or ask questions, contact our privacy team at{" "}
          <a
            className="text-seafoam-600 underline"
            href={`mailto:${PRIVACY_EMAIL}`}
          >
            {PRIVACY_EMAIL}
          </a>
          . We will respond within the timeframes required by applicable law.
        </p>
      </Section>
    </DocPage>
  );
}
