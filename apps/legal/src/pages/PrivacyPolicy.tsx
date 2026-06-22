import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import {
  COMPANY_NAME,
  PRIVACY_EMAIL,
  SECURITY_EMAIL,
  REGISTERED_ADDRESS,
  LEGAL_URL,
  LAST_UPDATED,
} from "../docs";

const toc = [
  { id: "overview",      title: "1. Overview" },
  { id: "definitions",   title: "2. Definitions" },
  { id: "data",          title: "3. Information We Collect" },
  { id: "use",           title: "4. How We Use Information" },
  { id: "sharing",       title: "5. Disclosure of Information" },
  { id: "subprocessors", title: "6. Service Providers" },
  { id: "retention",     title: "7. Retention" },
  { id: "security",      title: "8. Security" },
  { id: "transfers",     title: "9. International Transfers" },
  { id: "sale",          title: "10. No Sale of Data" },
  { id: "ccpa",          title: "11. California Rights (CCPA)" },
  { id: "gdpr",          title: "12. EEA / UK Rights (GDPR)" },
  { id: "minors",        title: "13. Children's Privacy" },
  { id: "changes",       title: "14. Changes to This Policy" },
  { id: "contact",       title: "15. Contact & Data Requests" },
];

export function PrivacyPolicy() {
  return (
    <DocPage
      title="Privacy Policy"
      intro={`This Privacy Policy explains how ${COMPANY_NAME} ("Sweepr," "we," "us," or "our") collects, uses, discloses, and safeguards your personal information when you use our Platform. Last Updated: ${LAST_UPDATED}.`}
      toc={toc}
    >
      <Section id="overview" title="1. Overview">
        <p><strong>1.1</strong> This Policy applies to personal information we process about registered users (Customers and Cleaners), applicants, and website visitors in connection with the Sweepr Platform.</p>
        <p><strong>1.2</strong> By using the Platform, you acknowledge that you have read and understood this Policy. If you do not agree with our practices, please discontinue use of the Platform.</p>
        <p><strong>1.3</strong> Sweepr operates as the data controller for personal information processed under this Policy. Where we act as a data processor on behalf of another controller, a separate data processing agreement governs.</p>
      </Section>

      <Section id="definitions" title="2. Definitions">
        <ul className="list-disc space-y-2 pl-6">
          <li><strong>"Personal Information"</strong> means any information that identifies or could reasonably be used to identify a natural person, directly or indirectly.</li>
          <li><strong>"Platform"</strong> means Sweepr's websites, web apps, and APIs as defined in our Terms of Service.</li>
          <li><strong>"Processing"</strong> means any operation performed on Personal Information, including collection, storage, use, disclosure, or deletion.</li>
          <li><strong>"Sensitive Personal Information"</strong> includes Social Security Numbers, government-issued identification, financial account numbers, and biometric data. <strong>Sweepr does not collect Sensitive Personal Information directly.</strong> Such data is collected by our verified third-party service providers (Checkr, Didit, Stripe) on their own secured systems.</li>
        </ul>
      </Section>

      <Section id="data" title="3. Information We Collect">
        <p><strong>3.1 Information You Provide Directly:</strong></p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Identity data: first name, last name, email address, phone number;</li>
          <li>Account credentials (managed by Clerk — we do not store passwords);</li>
          <li>Booking data: service address, home size, service preferences, scheduling details, and notes;</li>
          <li>Business information (for Cleaner businesses): business name, license numbers, and authorized representative details;</li>
          <li>Communications: messages you send through the Platform.</li>
        </ul>
        <p><strong>3.2 Information Collected Automatically:</strong></p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Technical data: IP address, device type, browser type and version, operating system;</li>
          <li>Usage data: pages visited, features used, session duration, clickstream data;</li>
          <li>Location data: service address coordinates (used for Cleaner matching and mapping);</li>
          <li>Cookies and similar tracking technologies as described in our <a className="text-seafoam-600 underline" href={`${LEGAL_URL}/cookie-policy`}>Cookie Policy</a>.</li>
        </ul>
        <p><strong>3.3 Information from Third Parties:</strong></p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Background check status (pass/fail/pending) from Checkr — PII is collected and retained by Checkr, not Sweepr;</li>
          <li>Identity verification status from Didit — ID images and biometric data are collected by Didit on their secure systems; Sweepr receives only a verification result;</li>
          <li>Payment tokenization data from Stripe — we receive a token reference, not full card numbers;</li>
          <li>Authentication data from Clerk.</li>
        </ul>
      </Section>

      <Section id="use" title="4. How We Use Information">
        <p><strong>4.1</strong> We use Personal Information for the following purposes and on the following legal bases:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li><strong>Contract Performance:</strong> To create and manage your account, process Bookings, match Customers with Cleaners, facilitate payments, and provide customer support;</li>
          <li><strong>Legal Obligation:</strong> To comply with applicable laws including tax obligations, background check requirements, and financial recordkeeping;</li>
          <li><strong>Legitimate Interests:</strong> To operate, secure, improve, and promote the Platform; to detect and prevent fraud and abuse; to analyze usage trends;</li>
          <li><strong>Consent:</strong> To send promotional communications and SMS messages where you have expressly opted in; to set non-essential cookies.</li>
        </ul>
        <p><strong>4.2</strong> We do not use your Personal Information for automated decision-making that produces legal or similarly significant effects on you without human review.</p>
      </Section>

      <Section id="sharing" title="5. Disclosure of Information">
        <p><strong>5.1</strong> We may share your Personal Information in the following circumstances:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li><strong>With Service Providers:</strong> We share information with subprocessors listed in Section 6 to the extent necessary to operate the Platform. All subprocessors are bound by data processing agreements requiring appropriate security measures.</li>
          <li><strong>Between Users:</strong> Customers may see a Cleaner's first name, profile photo, and rating. Cleaners receive a Customer's service address and first name for confirmed Bookings.</li>
          <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, financing, or sale of all or substantially all of our assets, your information may be transferred as part of that transaction.</li>
          <li><strong>Legal Requirements:</strong> We may disclose information where required by law, court order, or to protect the rights, property, or safety of Sweepr, our users, or the public.</li>
          <li><strong>With Your Consent:</strong> In any other circumstances with your prior consent.</li>
        </ul>
        <p><strong>5.2</strong> We do not disclose Personal Information to unaffiliated third parties for their own marketing purposes.</p>
      </Section>

      <Section id="subprocessors" title="6. Service Providers (Subprocessors)">
        <p><strong>6.1</strong> We rely on the following service providers, each of which processes personal data on our behalf under contract:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Clerk</strong> — authentication and identity management;</li>
          <li><strong>Stripe</strong> — payment processing (PCI-DSS Level 1 certified);</li>
          <li><strong>Checkr</strong> — background screening (FCRA-compliant);</li>
          <li><strong>Didit</strong> — identity document verification;</li>
          <li><strong>Neon</strong> — PostgreSQL database hosting;</li>
          <li><strong>Firebase / Google</strong> — real-time notifications;</li>
          <li><strong>Cloudflare</strong> — CDN, hosting, and security services;</li>
          <li><strong>MailerSend</strong> — transactional email delivery;</li>
          <li><strong>Mapbox</strong> — mapping and geocoding services;</li>
          <li><strong>Twilio</strong> — SMS message delivery;</li>
          <li><strong>PostHog</strong> — product analytics (self-hosted configuration, no third-party sale).</li>
        </ul>
      </Section>

      <Section id="retention" title="7. Data Retention">
        <p><strong>7.1</strong> We retain Personal Information only as long as necessary for the purposes described in this Policy or as required by law:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Financial and transaction records: seven (7) years from the date of transaction (tax and legal requirements);</li>
          <li>Account data: three (3) years after the account becomes inactive or is deleted;</li>
          <li>Access and system logs: two (2) years;</li>
          <li>Background-check status references: duration of the Cleaner relationship plus two (2) years;</li>
          <li>Marketing consent records: retained until consent is withdrawn plus applicable statutory period.</li>
        </ul>
        <p><strong>7.2</strong> You may request deletion of your Personal Information at any time subject to the exceptions in Sections 11 and 12 and any legal retention obligations.</p>
      </Section>

      <Section id="security" title="8. Security">
        <p><strong>8.1</strong> We implement appropriate technical and organizational measures to protect Personal Information against unauthorized access, disclosure, alteration, or destruction, including:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Encryption of data in transit (TLS 1.2+) and at rest;</li>
          <li>Tokenization of payment data through Stripe;</li>
          <li>Role-based access controls and principle of least privilege;</li>
          <li>Regular security assessments and monitoring.</li>
        </ul>
        <p><strong>8.2</strong> No security system is perfect. We cannot guarantee absolute security, and we are not liable for unauthorized access resulting from circumstances beyond our reasonable control.</p>
        <p><strong>8.3</strong> To report a security vulnerability, contact <a className="text-seafoam-600 underline" href={`mailto:${SECURITY_EMAIL}`}>{SECURITY_EMAIL}</a>.</p>
      </Section>

      <Section id="transfers" title="9. International Data Transfers">
        <p><strong>9.1</strong> The Platform is operated from the United States. If you are located outside the United States, your Personal Information will be transferred to and processed in the United States.</p>
        <p><strong>9.2</strong> For transfers of Personal Information from the European Economic Area (EEA) or United Kingdom to the United States, we rely on Standard Contractual Clauses (SCCs) approved by the European Commission and the UK International Data Transfer Agreement (IDTA), as applicable.</p>
      </Section>

      <Section id="sale" title="10. No Sale of Personal Information">
        <p><strong>10.1</strong> <strong>We do not sell your Personal Information to third parties for monetary or other valuable consideration.</strong></p>
        <p><strong>10.2</strong> We do not "share" Personal Information for cross-context behavioral advertising as that term is defined under the California Consumer Privacy Act (CCPA) as amended by the California Privacy Rights Act (CPRA).</p>
      </Section>

      <Section id="ccpa" title="11. California Privacy Rights (CCPA / CPRA)">
        <p><strong>11.1</strong> California residents have the following rights under the California Consumer Privacy Act (Cal. Civ. Code § 1798.100 et seq.), as amended by the California Privacy Rights Act:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li><strong>Right to Know:</strong> You have the right to request disclosure of the categories and specific pieces of Personal Information we have collected about you, the categories of sources, the purposes for collection, and the categories of third parties with whom we share it.</li>
          <li><strong>Right to Delete:</strong> You have the right to request deletion of Personal Information we have collected, subject to certain exceptions.</li>
          <li><strong>Right to Correct:</strong> You have the right to request correction of inaccurate Personal Information.</li>
          <li><strong>Right to Opt Out:</strong> You have the right to opt out of the sale or sharing of your Personal Information (we do not sell or share as defined).</li>
          <li><strong>Right to Limit Use of Sensitive Personal Information:</strong> Not applicable as we do not collect Sensitive Personal Information directly.</li>
          <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising any of these rights.</li>
        </ul>
        <p><strong>11.2</strong> To exercise your CCPA rights, submit a verifiable consumer request to <a className="text-seafoam-600 underline" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. We will respond within forty-five (45) days of receipt.</p>
      </Section>

      <Section id="gdpr" title="12. EEA and UK Privacy Rights (GDPR / UK GDPR)">
        <p><strong>12.1</strong> If you are located in the European Economic Area or United Kingdom, you have the following rights under the General Data Protection Regulation (GDPR) and/or UK GDPR:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Right of Access (Art. 15):</strong> Obtain confirmation of whether we process your data and a copy of it;</li>
          <li><strong>Right to Rectification (Art. 16):</strong> Correct inaccurate or incomplete personal data;</li>
          <li><strong>Right to Erasure (Art. 17):</strong> Request deletion of your personal data in certain circumstances;</li>
          <li><strong>Right to Restriction (Art. 18):</strong> Restrict processing in certain circumstances;</li>
          <li><strong>Right to Data Portability (Art. 20):</strong> Receive your data in a structured, machine-readable format;</li>
          <li><strong>Right to Object (Art. 21):</strong> Object to processing based on legitimate interests or for direct marketing;</li>
          <li><strong>Right to Withdraw Consent:</strong> Where processing is based on consent, withdraw it at any time without affecting the lawfulness of prior processing.</li>
        </ul>
        <p><strong>12.2</strong> To exercise GDPR rights, contact <a className="text-seafoam-600 underline" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. We will respond within thirty (30) days. You also have the right to lodge a complaint with your national supervisory authority.</p>
      </Section>

      <Section id="minors" title="13. Children's Privacy">
        <p><strong>13.1</strong> The Platform is not directed to children under the age of eighteen (18). We do not knowingly collect Personal Information from persons under 18. If we learn that we have inadvertently collected such information, we will delete it promptly.</p>
        <p><strong>13.2</strong> If you believe we have collected information from a child under 18, please contact us at <a className="text-seafoam-600 underline" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.</p>
      </Section>

      <Section id="changes" title="14. Changes to This Policy">
        <p><strong>14.1</strong> We may update this Privacy Policy from time to time. Material changes will be communicated by email or by prominent notice on the Platform at least fourteen (14) days before the change takes effect.</p>
        <p><strong>14.2</strong> The "Last Updated" date at the top of this Policy reflects the most recent revision. Your continued use of the Platform after the effective date constitutes your acceptance of the revised Policy.</p>
      </Section>

      <Section id="contact" title="15. Contact and Data Requests">
        <p>For privacy inquiries, data subject requests, or to contact our privacy team:</p>
        <address className="not-italic mt-3 space-y-1 text-sm text-slate-700">
          <p><strong>Privacy Team — {COMPANY_NAME}</strong></p>
          <p>{REGISTERED_ADDRESS}</p>
          <p>Email: <a className="text-seafoam-600 underline" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a></p>
        </address>
      </Section>
    </DocPage>
  );
}
