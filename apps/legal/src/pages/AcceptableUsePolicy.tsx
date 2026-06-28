// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "prohibited", title: "Prohibited Uses" },
  { id: "security", title: "Security & Access" },
  { id: "content", title: "Prohibited Content & Conditions" },
  { id: "enforcement", title: "Enforcement" },
];

export function AcceptableUsePolicy() {
  return (
    <DocPage
      title="Acceptable Use Policy"
      version={DOC_VERSION}
      intro="This policy describes uses of Sweepr that are not allowed. It supplements the Terms of Service and applies to all users."
      toc={toc}
    >
      <Section id="prohibited" title="1. Prohibited Uses">
        <ul className="list-disc space-y-1 pl-6">
          <li>Fraud, false accounts, or impersonation;</li>
          <li>Harassment, discrimination, or spam;</li>
          <li>Scraping, crawling, or bulk data extraction;</li>
          <li>Circumventing fees or the Platform;</li>
          <li>Any unlawful purpose.</li>
        </ul>
      </Section>

      <Section id="security" title="2. Security & Access">
        <ul className="list-disc space-y-1 pl-6">
          <li>No unauthorized access to systems or accounts;</li>
          <li>No malware, exploits, or interference with the Platform;</li>
          <li>No circumvention of security or access controls.</li>
        </ul>
        <p>
          Report vulnerabilities responsibly under the{" "}
          <Link className="text-seafoam-600 underline" to="/vulnerability-disclosure">
            Vulnerability Disclosure Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="content" title="3. Prohibited Content & Property Conditions">
        <p>
          Do not submit unlawful, infringing, or harmful content, or request
          services for unlawful activities or unsafe/illegal property conditions.
        </p>
      </Section>

      <Section id="enforcement" title="4. Enforcement">
        <p>
          Violations may result in content removal, suspension, or termination, and
          may be reported to authorities where appropriate. Report misuse to{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
