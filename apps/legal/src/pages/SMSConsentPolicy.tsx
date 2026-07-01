import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL } from "../docs";

const toc = [
  { id: "consent",     title: "1. What You Are Consenting To" },
  { id: "disclosures", title: "2. Additional Disclosures" },
  { id: "links",       title: "3. Related Policies" },
];

/**
 * Public carrier-verification page (10DLC / toll-free / short code).
 * No login required — carriers and reviewers link to this page directly.
 */
export function SMSConsentPolicy() {
  const link = "text-seafoam-600 underline";
  return (
    <DocPage
      title="Receive SMS Updates from Sweepr"
      intro="By checking the SMS consent box during registration or booking, you agree to receive SMS messages from Sweepr."
      toc={toc}
    >
      <Section id="consent" title="1. What You Are Consenting To">
        <p>
          By checking the SMS consent box during registration or booking, you
          agree to receive SMS messages regarding:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Account verification</li>
          <li>One-time passcodes</li>
          <li>Password resets</li>
          <li>Login verification</li>
          <li>Booking confirmations</li>
          <li>Cleaner assignment</li>
          <li>Arrival notifications</li>
          <li>Cleaning status</li>
          <li>Receipts</li>
          <li>Customer support</li>
        </ul>
      </Section>

      <Section id="disclosures" title="2. Additional Disclosures">
        <ul className="list-disc space-y-1 pl-6">
          <li>Message frequency varies.</li>
          <li>Message and data rates may apply.</li>
          <li>Reply <strong>STOP</strong> to unsubscribe.</li>
          <li>Reply <strong>HELP</strong> for assistance.</li>
          <li>Consent is not a condition of purchasing services.</li>
        </ul>
      </Section>

      <Section id="links" title="3. Related Policies">
        <ul className="list-disc space-y-1 pl-6">
          <li><a className={link} href="/privacy">Privacy Policy</a></li>
          <li><a className={link} href="/terms">Terms of Service</a></li>
          <li><a className={link} href={`mailto:${SUPPORT_EMAIL}`}>Support</a></li>
        </ul>
      </Section>
    </DocPage>
  );
}
