// DRAFT — attorney review required before production use.
// NOTE: Authorization should be captured via an explicit, separately-recorded
// acknowledgement (checkbox/signature) tied to a disclosure version. Counsel must
// confirm wording and state requirements before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "authorization", title: "Authorization" },
  { id: "scope", title: "Scope" },
  { id: "ongoing", title: "Ongoing Authorization" },
  { id: "record", title: "How Consent Is Recorded" },
  { id: "questions", title: "Questions" },
];

export function BackgroundCheckAuthorization() {
  return (
    <DocPage
      title="Background Check Authorization"
      version={DOC_VERSION}
      intro="By providing your authorization in the application flow, you authorize Sweepr to obtain consumer reports about you as described in the Background Check Disclosure."
      toc={toc}
    >
      <Section id="authorization" title="1. Authorization">
        <p>
          Having read the{" "}
          <Link className="text-seafoam-600 underline" to="/background-check-disclosure">
            Background Check Disclosure
          </Link>
          , you authorize Sweepr and its screening vendor to obtain a consumer
          report and, where applicable, an investigative consumer report about you
          for eligibility purposes.
        </p>
      </Section>

      <Section id="scope" title="2. Scope">
        <p>
          Your authorization covers verification of identity and review of
          background information relevant to platform eligibility, obtained from a
          consumer reporting agency such as Checkr.
        </p>
      </Section>

      <Section id="ongoing" title="3. Ongoing Authorization">
        <p>
          To the extent permitted by applicable law, your authorization may apply
          to reports obtained during your time on the platform. Where the law
          requires renewed authorization, you will be asked again.
        </p>
      </Section>

      <Section id="record" title="4. How Consent Is Recorded">
        <p>
          When you authorize a background check, Sweepr records the disclosure and
          authorization versions, the timestamp, and related metadata to
          demonstrate informed consent. This record is handled under the{" "}
          <Link className="text-seafoam-600 underline" to="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="questions" title="5. Questions">
        <p>
          For help or to dispute report information, see the{" "}
          <Link className="text-seafoam-600 underline" to="/background-check-adverse-action">
            Adverse Action Policy
          </Link>{" "}
          or contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
