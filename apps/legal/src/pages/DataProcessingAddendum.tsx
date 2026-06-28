// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { LEGAL_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "scope", title: "Scope & Roles" },
  { id: "instructions", title: "Processing Instructions" },
  { id: "subprocessors", title: "Subprocessors" },
  { id: "security", title: "Security Measures" },
  { id: "breach", title: "Breach Notification" },
  { id: "dsar", title: "Data Subject Requests" },
  { id: "transfers", title: "International Transfers" },
  { id: "deletion", title: "Return & Deletion" },
  { id: "audit", title: "Audit" },
];

export function DataProcessingAddendum() {
  return (
    <DocPage
      title="Data Processing Addendum"
      version={DOC_VERSION}
      intro="This Data Processing Addendum (DPA) applies where Sweepr processes personal data on behalf of a business customer (for example, property management or enterprise accounts). It forms part of the agreement between Sweepr and that customer."
      toc={toc}
    >
      <Section id="scope" title="1. Scope & Roles">
        <p>
          Where Sweepr processes personal data on behalf of a business customer,
          the customer is the controller and Sweepr is the processor. Where Sweepr
          determines purposes and means (for example, its own platform operations),
          Sweepr acts as a controller under the{" "}
          <Link className="text-seafoam-600 underline" to="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="instructions" title="2. Processing Instructions">
        <p>
          Sweepr processes controller personal data only on documented instructions
          from the controller, except as required by law, and for the purpose of
          providing the services.
        </p>
      </Section>

      <Section id="subprocessors" title="3. Subprocessors">
        <p>
          Sweepr engages the subprocessors listed on the{" "}
          <Link className="text-seafoam-600 underline" to="/subprocessors">
            Subprocessors
          </Link>{" "}
          page and imposes data-protection obligations on them consistent with this
          DPA.
        </p>
      </Section>

      <Section id="security" title="4. Security Measures">
        <p>
          Sweepr maintains appropriate technical and organizational measures as
          described in the{" "}
          <Link className="text-seafoam-600 underline" to="/security">
            Security Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="breach" title="5. Breach Notification">
        <p>
          Sweepr will notify the controller without undue delay after becoming aware
          of a personal data breach affecting controller personal data and will
          provide information reasonably available to assist the controller.
        </p>
      </Section>

      <Section id="dsar" title="6. Data Subject Requests">
        <p>
          Taking into account the nature of processing, Sweepr will assist the
          controller in responding to data subject requests it cannot fulfill
          directly.
        </p>
      </Section>

      <Section id="transfers" title="7. International Transfers">
        <p>
          Where personal data is transferred internationally, Sweepr will rely on a
          lawful transfer mechanism, such as the EU Standard Contractual Clauses or
          the UK IDTA, where applicable.
        </p>
      </Section>

      <Section id="deletion" title="8. Return & Deletion">
        <p>
          On termination, Sweepr will delete or return controller personal data,
          except where retention is required by law.
        </p>
      </Section>

      <Section id="audit" title="9. Audit">
        <p>
          Sweepr will make available information reasonably necessary to demonstrate
          compliance with this DPA and allow for audits subject to reasonable
          confidentiality and security conditions. To request a signed DPA, contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${LEGAL_EMAIL}`}>
            {LEGAL_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
