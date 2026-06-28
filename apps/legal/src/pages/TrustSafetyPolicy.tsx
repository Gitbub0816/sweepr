// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "expectations", title: "Shared Expectations" },
  { id: "prohibited", title: "Prohibited Conduct" },
  { id: "unsafe", title: "Unsafe Home Conditions" },
  { id: "emergencies", title: "Emergencies" },
  { id: "access", title: "Entry, Access & Check-In" },
  { id: "vulnerable", title: "Minors & Vulnerable Occupants" },
  { id: "identity", title: "Cleaner Identity" },
  { id: "reporting", title: "Incident Reporting & Enforcement" },
];

export function TrustSafetyPolicy() {
  return (
    <DocPage
      title="Trust & Safety Policy"
      version={DOC_VERSION}
      intro="Safety is a shared responsibility. This policy sets expectations for safer interactions between customers and Cleaners and explains how Sweepr responds to safety issues."
      toc={toc}
    >
      <Section id="expectations" title="1. Shared Expectations">
        <p>
          Everyone on Sweepr is expected to act safely, lawfully, and respectfully.
          Customers must provide a safe environment; Cleaners must behave
          professionally and follow safety procedures.
        </p>
      </Section>

      <Section id="prohibited" title="2. Prohibited Conduct">
        <ul className="list-disc space-y-1 pl-6">
          <li>Threats, harassment, intimidation, or violence;</li>
          <li>Discrimination or hate speech;</li>
          <li>Sexual harassment or inappropriate conduct;</li>
          <li>Intoxication or drug use affecting safety;</li>
          <li>Presence of unsecured weapons creating risk.</li>
        </ul>
      </Section>

      <Section id="unsafe" title="3. Unsafe Home Conditions">
        <p>
          Cleaners may decline or stop work in conditions involving aggressive
          pets, hazardous materials, biohazards, severe unsanitary conditions, or
          other risks. Customers must disclose known hazards in advance. See the{" "}
          <Link className="text-seafoam-600 underline" to="/service-scope">
            Service Scope Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="emergencies" title="4. Emergencies">
        <p>
          In an emergency, contact local emergency services first (for example,
          911 in the U.S.), then report the incident to Sweepr. Sweepr may
          escalate serious safety matters to authorities.
        </p>
      </Section>

      <Section id="access" title="5. Entry, Access & Check-In">
        <p>
          Cleaners check in and out through the app. When a customer is not present,
          access must follow the customer's instructions. Lost keys or access codes
          must be reported immediately. Access codes are confidential and used only
          for the specific job.
        </p>
      </Section>

      <Section id="vulnerable" title="6. Minors & Vulnerable Occupants">
        <p>
          Customers are responsible for the supervision of children and vulnerable
          occupants during a cleaning. Cleaners should not be left solely
          responsible for minors.
        </p>
      </Section>

      <Section id="identity" title="7. Cleaner Identity">
        <p>
          Cleaners are identity-verified and background-checked during onboarding.
          Customers can view the assigned Cleaner's profile. Report any mismatch
          before allowing entry.
        </p>
      </Section>

      <Section id="reporting" title="8. Incident Reporting & Enforcement">
        <p>
          Report safety incidents through the app's "Report a problem" flow or to{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . Sweepr may temporarily suspend accounts during investigation and
          enforces a zero-tolerance approach to serious misconduct under the{" "}
          <Link className="text-seafoam-600 underline" to="/community-guidelines">
            Community Guidelines
          </Link>
          .
        </p>
      </Section>
    </DocPage>
  );
}
