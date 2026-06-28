// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "consent", title: "Consent to Electronic Records" },
  { id: "signatures", title: "Electronic Signatures" },
  { id: "delivery", title: "How We Deliver Records" },
  { id: "hardware", title: "Hardware & Software" },
  { id: "withdraw", title: "Withdrawing Consent" },
  { id: "paper", title: "Requesting Paper Copies" },
];

export function ESignConsent() {
  return (
    <DocPage
      title="Electronic Communications & E-Sign Consent"
      version={DOC_VERSION}
      intro="By using Sweepr, you consent to receive communications and records electronically and to sign documents electronically, consistent with the federal E-SIGN Act and applicable state law."
      toc={toc}
    >
      <Section id="consent" title="1. Consent to Electronic Records">
        <p>
          You agree that Sweepr may provide agreements, disclosures, notices,
          receipts, tax forms (where you consent), and other records electronically,
          including in-app, by email, or by other electronic means.
        </p>
      </Section>

      <Section id="signatures" title="2. Electronic Signatures">
        <p>
          Your electronic acceptance (for example, clicking "I agree", checking a
          box, or signing in the app) has the same legal effect as a handwritten
          signature.
        </p>
      </Section>

      <Section id="delivery" title="3. How We Deliver Records">
        <p>
          Records may be delivered through the app, posted to the legal site, or sent
          to the email or phone number associated with your account. Keep your
          contact information current.
        </p>
      </Section>

      <Section id="hardware" title="4. Hardware & Software">
        <p>
          To access electronic records you need a current web browser or the Sweepr
          app, internet access, an email account, and the ability to view PDFs.
        </p>
      </Section>

      <Section id="withdraw" title="5. Withdrawing Consent">
        <p>
          You may withdraw consent to receive records electronically by contacting{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . Withdrawal does not affect the validity of records provided before
          withdrawal, and may limit your ability to use certain features.
        </p>
      </Section>

      <Section id="paper" title="6. Requesting Paper Copies">
        <p>
          You may request a paper copy of a record by contacting support. A
          reasonable fee may apply where permitted. See also the{" "}
          <Link className="text-seafoam-600 underline" to="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>
    </DocPage>
  );
}
