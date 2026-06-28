// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "uses", title: "How We Use Automated Systems" },
  { id: "human", title: "Human Review" },
  { id: "data", title: "Data Used" },
  { id: "limits", title: "Limitations & Your Options" },
];

export function AIDisclosure() {
  return (
    <DocPage
      title="AI Disclosure"
      version={DOC_VERSION}
      intro="This disclosure explains how Sweepr may use automated systems and artificial intelligence to support its operations."
      toc={toc}
    >
      <Section id="uses" title="1. How We Use Automated Systems">
        <p>
          Sweepr may use automated systems and AI to assist with customer support,
          operations, fraud and safety detection, summaries, document generation,
          dispatch and matching, route optimization, and pricing or recommendations.
        </p>
      </Section>

      <Section id="human" title="2. Human Review">
        <p>
          Legally or materially significant decisions — such as account deactivation,
          application denial, or high-risk trust and safety actions — receive human
          review. Automated tools support, but do not solely determine, these
          outcomes.
        </p>
      </Section>

      <Section id="data" title="3. Data Used">
        <p>
          Automated systems operate on platform data handled under the{" "}
          <Link className="text-seafoam-600 underline" to="/privacy">
            Privacy Policy
          </Link>
          . Sensitive data is not entered into unapproved AI systems.
        </p>
      </Section>

      <Section id="limits" title="4. Limitations & Your Options">
        <p>
          Automated systems can make mistakes. If you believe an automated decision
          was wrong, you may contact support for human review at{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
