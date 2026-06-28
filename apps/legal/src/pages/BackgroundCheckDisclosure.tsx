// DRAFT — attorney review required before production use.
// NOTE: FCRA disclosures must, in most cases, be a STANDALONE document presented
// separately from any other agreement. Counsel must confirm formatting and
// state-specific requirements before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "purpose", title: "Purpose of This Disclosure" },
  { id: "consumer-report", title: "Consumer Report" },
  { id: "investigative", title: "Investigative Consumer Reports" },
  { id: "vendor", title: "Screening Vendor" },
  { id: "rights", title: "Your Rights" },
  { id: "state", title: "State-Specific Notices" },
  { id: "recheck", title: "Renewal & Re-Checks" },
];

export function BackgroundCheckDisclosure() {
  return (
    <DocPage
      title="Background Check Disclosure"
      version={DOC_VERSION}
      intro="This is a disclosure that Sweepr may obtain a consumer report (background check) about you in connection with your application to provide cleaning services through the platform."
      toc={toc}
    >
      <Section id="purpose" title="1. Purpose of This Disclosure">
        <p>
          Sweepr will obtain one or more consumer reports about you for the purpose
          of evaluating your eligibility to use the platform as a Cleaner, and may
          obtain additional reports during your time on the platform consistent
          with applicable law.
        </p>
      </Section>

      <Section id="consumer-report" title="2. Consumer Report">
        <p>
          A "consumer report" may include information about your criminal history,
          identity verification, and other information bearing on eligibility,
          obtained from a consumer reporting agency. Sweepr receives only the
          status and results needed to assess eligibility and does not seek
          unnecessary sensitive data.
        </p>
      </Section>

      <Section id="investigative" title="3. Investigative Consumer Reports">
        <p>
          Where applicable, an investigative consumer report (information obtained
          through personal interviews) may be requested. You may request additional
          disclosures about the nature and scope of any such report.
        </p>
      </Section>

      <Section id="vendor" title="4. Screening Vendor">
        <p>
          Background checks are performed by a third-party consumer reporting
          agency such as Checkr. Their handling of your data is governed by their
          own terms and privacy notices, and by Sweepr's{" "}
          <Link className="text-seafoam-600 underline" to="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="rights" title="5. Your Rights">
        <p>
          You have rights under the federal Fair Credit Reporting Act (FCRA),
          including the right to receive a summary of your rights, to be notified
          if information in a report may result in an adverse decision, and to
          dispute inaccurate information. See the{" "}
          <Link className="text-seafoam-600 underline" to="/background-check-adverse-action">
            Adverse Action Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="state" title="6. State-Specific Notices">
        <p>
          Additional disclosures may apply depending on your state (for example,
          California, New York, and others). Applicable state notices will be
          provided where required.
        </p>
      </Section>

      <Section id="recheck" title="7. Renewal & Re-Checks">
        <p>
          Sweepr may obtain updated reports periodically to maintain platform
          safety, subject to any required renewed authorization. Questions?
          Contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . After reading this disclosure, you will be asked to provide your{" "}
          <Link className="text-seafoam-600 underline" to="/background-check-authorization">
            authorization
          </Link>
          .
        </p>
      </Section>
    </DocPage>
  );
}
