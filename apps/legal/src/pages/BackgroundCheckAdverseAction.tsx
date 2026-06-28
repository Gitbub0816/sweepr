// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "overview", title: "Overview" },
  { id: "pre-adverse", title: "Pre-Adverse Action Notice" },
  { id: "dispute", title: "Dispute Window" },
  { id: "adverse", title: "Adverse Action Notice" },
  { id: "assessment", title: "Individualized Assessment" },
  { id: "minimization", title: "Data Minimization" },
];

export function BackgroundCheckAdverseAction() {
  return (
    <DocPage
      title="Background Check Adverse Action Policy"
      version={DOC_VERSION}
      intro="This policy describes the process Sweepr follows under the FCRA when information in a background check may lead to a decision to deny or remove platform access."
      toc={toc}
    >
      <Section id="overview" title="1. Overview">
        <p>
          If Sweepr is considering taking action based in whole or in part on a
          consumer report, Sweepr follows a two-step pre-adverse and adverse action
          process and provides required notices and rights materials.
        </p>
      </Section>

      <Section id="pre-adverse" title="2. Pre-Adverse Action Notice">
        <p>
          Before taking adverse action, Sweepr will provide a pre-adverse action
          notice that includes a copy of the consumer report relied upon and a
          summary of your rights under the FCRA.
        </p>
      </Section>

      <Section id="dispute" title="3. Dispute Window">
        <p>
          You will be given a reasonable period to review the report and to dispute
          inaccurate or incomplete information directly with the consumer reporting
          agency before a final decision is made.
        </p>
      </Section>

      <Section id="adverse" title="4. Adverse Action Notice">
        <p>
          If, after the dispute window, Sweepr proceeds with adverse action, you
          will receive an adverse action notice with the consumer reporting
          agency's contact information, a statement that the agency did not make the
          decision, and notice of your right to obtain a free copy of your report
          and to dispute its accuracy.
        </p>
      </Section>

      <Section id="assessment" title="5. Individualized Assessment">
        <p>
          Where appropriate or required by law, Sweepr considers relevant factors
          (such as the nature of the conduct and its relationship to the work)
          rather than applying automatic exclusions.
        </p>
      </Section>

      <Section id="minimization" title="6. Data Minimization">
        <p>
          Sweepr receives only the report status and results needed to assess
          eligibility and handles that information under the{" "}
          <Link className="text-seafoam-600 underline" to="/privacy">
            Privacy Policy
          </Link>
          . Questions? Contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
