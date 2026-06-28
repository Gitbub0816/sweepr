// DRAFT — attorney review required before production use.
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { LEGAL_EMAIL, COMPANY_NAME, REGISTERED_ADDRESS, DOC_VERSION } from "../docs";

const toc = [
  { id: "where", title: "Where to Send Requests" },
  { id: "required", title: "Required Information" },
  { id: "emergency", title: "Emergency Disclosure" },
  { id: "notice", title: "User Notice" },
  { id: "preservation", title: "Preservation Requests" },
  { id: "costs", title: "Cost Reimbursement" },
];

export function LawEnforcementRequests() {
  return (
    <DocPage
      title="Law Enforcement Requests"
      version={DOC_VERSION}
      intro="This page explains how Sweepr handles legal process and law enforcement requests for user information. It is intended for law enforcement and legal professionals."
      toc={toc}
    >
      <Section id="where" title="1. Where to Send Requests">
        <p>
          Subpoenas, court orders, and other legal process should be directed to{" "}
          {COMPANY_NAME}, Attn: Legal, {REGISTERED_ADDRESS}, or by email to{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${LEGAL_EMAIL}`}>
            {LEGAL_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section id="required" title="2. Required Information">
        <p>
          Requests should identify the requesting agency and authorized official,
          the specific account or data sought, the legal basis, and a response
          deadline that allows reasonable time to respond. Requests must be valid and
          properly served.
        </p>
      </Section>

      <Section id="emergency" title="3. Emergency Disclosure">
        <p>
          In emergencies involving a risk of death or serious physical harm, Sweepr
          may disclose limited information consistent with applicable law and its
          good-faith assessment of the emergency.
        </p>
      </Section>

      <Section id="notice" title="4. User Notice">
        <p>
          Sweepr may notify users of requests for their information unless prohibited
          by law or where notice would be counterproductive in an emergency.
        </p>
      </Section>

      <Section id="preservation" title="5. Preservation Requests">
        <p>
          Sweepr will honor valid preservation requests to retain specified records
          for a limited period pending lawful process.
        </p>
      </Section>

      <Section id="costs" title="6. Cost Reimbursement">
        <p>
          Sweepr may seek reimbursement of reasonable costs for responding to legal
          process where permitted by law.
        </p>
      </Section>
    </DocPage>
  );
}
