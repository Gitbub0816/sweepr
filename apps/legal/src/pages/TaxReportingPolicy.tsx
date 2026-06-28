// DRAFT — attorney review required before production use. This is not tax advice.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "responsibility", title: "Cleaner Tax Responsibility" },
  { id: "no-advice", title: "No Tax Advice" },
  { id: "w9", title: "W-9 & TIN Verification" },
  { id: "withholding", title: "Backup Withholding" },
  { id: "forms", title: "Information Returns (1099s)" },
  { id: "delivery", title: "Delivery & Consent" },
  { id: "holds", title: "Holds for Missing Info" },
  { id: "licenses", title: "Licenses & Permits" },
];

export function TaxReportingPolicy() {
  return (
    <DocPage
      title="Tax Reporting Policy"
      version={DOC_VERSION}
      intro="This policy describes how Sweepr handles tax information and forms for Cleaners. Cleaners are independent contractors responsible for their own taxes. This is not tax advice."
      toc={toc}
    >
      <Section id="responsibility" title="1. Cleaner Tax Responsibility">
        <p>
          As an independent contractor, you are solely responsible for reporting
          and paying all federal, state, and local taxes on your earnings,
          including self-employment taxes.
        </p>
      </Section>

      <Section id="no-advice" title="2. No Tax Advice">
        <p>
          Sweepr does not provide tax, legal, or accounting advice. Consult a
          qualified professional regarding your specific situation.
        </p>
      </Section>

      <Section id="w9" title="3. W-9 & TIN Verification">
        <p>
          You may be required to provide a Form W-9 and a valid taxpayer
          identification number (TIN). Sweepr (or its payment processor) may verify
          your legal name and TIN. Incorrect information may delay payouts or
          trigger backup withholding.
        </p>
      </Section>

      <Section id="withholding" title="4. Backup Withholding">
        <p>
          If required by law (for example, due to an incorrect or missing TIN),
          Sweepr or its processor may apply backup withholding to your payouts and
          remit it to the relevant tax authority.
        </p>
      </Section>

      <Section id="forms" title="5. Information Returns (1099s)">
        <p>
          Depending on your earnings and the payment structure, you may receive a
          Form 1099-NEC, 1099-K, or, where applicable, 1099-MISC. Thresholds and
          form types are determined by applicable law and the payment-settlement
          structure (including Stripe Connect). Corrections will be issued where
          appropriate.
        </p>
      </Section>

      <Section id="delivery" title="6. Delivery & Electronic Consent">
        <p>
          Where you consent, tax forms may be delivered electronically. See the{" "}
          <Link className="text-seafoam-600 underline" to="/e-sign">
            Electronic Communications &amp; E-Sign Consent
          </Link>
          .
        </p>
      </Section>

      <Section id="holds" title="7. Holds for Missing Information">
        <p>
          Sweepr may hold payouts until required tax information is provided and
          verified.
        </p>
      </Section>

      <Section id="licenses" title="8. Licenses & Permits">
        <p>
          You are responsible for obtaining any business licenses and permits
          required for your cleaning business. Questions? Contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
