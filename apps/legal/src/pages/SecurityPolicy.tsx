// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SECURITY_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "encryption", title: "Encryption" },
  { id: "access", title: "Access Control" },
  { id: "payments", title: "Payment Security" },
  { id: "logging", title: "Audit Logging" },
  { id: "incident", title: "Incident Response" },
  { id: "reporting", title: "Reporting" },
  { id: "user", title: "Your Responsibilities" },
  { id: "limits", title: "Limitations" },
];

export function SecurityPolicy() {
  return (
    <DocPage
      title="Security Policy"
      version={DOC_VERSION}
      intro="This policy summarizes how Sweepr protects platform and user data. It is a high-level description and not an exhaustive list of controls."
      toc={toc}
    >
      <Section id="encryption" title="1. Encryption">
        <p>
          Data is encrypted in transit using TLS and encrypted at rest by our
          infrastructure providers. Secrets are managed through secure
          configuration and are not stored in source code.
        </p>
      </Section>

      <Section id="access" title="2. Access Control">
        <p>
          We apply least-privilege access, role-based permissions, and
          authentication for administrative systems. Access to production data is
          limited to personnel who need it.
        </p>
      </Section>

      <Section id="payments" title="3. Payment Security">
        <p>
          Card data is tokenized and handled by our PCI-compliant payment
          processor. Sweepr does not store full card numbers.
        </p>
      </Section>

      <Section id="logging" title="4. Audit Logging">
        <p>
          Administrative and security-relevant actions are logged to support
          monitoring, investigations, and accountability.
        </p>
      </Section>

      <Section id="incident" title="5. Incident Response">
        <p>
          We maintain incident-response procedures to detect, contain, and remediate
          security events and to provide notifications required by law.
        </p>
      </Section>

      <Section id="reporting" title="6. Reporting a Concern">
        <p>
          Report suspected vulnerabilities under the{" "}
          <Link className="text-seafoam-600 underline" to="/vulnerability-disclosure">
            Vulnerability Disclosure Policy
          </Link>{" "}
          or email{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SECURITY_EMAIL}`}>
            {SECURITY_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section id="user" title="7. Your Responsibilities">
        <p>
          Keep your credentials confidential, use a strong unique password, and
          notify us of any unauthorized account access.
        </p>
      </Section>

      <Section id="limits" title="8. Limitations">
        <p>
          No system is perfectly secure. We continually improve our controls but
          cannot guarantee absolute security. We do not currently operate a paid bug
          bounty unless expressly stated.
        </p>
      </Section>
    </DocPage>
  );
}
