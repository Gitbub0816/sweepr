// DRAFT — attorney review required before production use. A designated DMCA agent
// must be registered with the U.S. Copyright Office before relying on safe harbor.
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { LEGAL_EMAIL, COMPANY_NAME, REGISTERED_ADDRESS, DOC_VERSION } from "../docs";

const toc = [
  { id: "overview", title: "Overview" },
  { id: "takedown", title: "Takedown Notices" },
  { id: "counter", title: "Counter-Notices" },
  { id: "repeat", title: "Repeat Infringers" },
  { id: "agent", title: "Designated Agent" },
];

export function CopyrightPolicy() {
  return (
    <DocPage
      title="Copyright / DMCA Policy"
      version={DOC_VERSION}
      intro="Sweepr respects intellectual property rights and responds to notices of alleged copyright infringement consistent with the Digital Millennium Copyright Act (DMCA)."
      toc={toc}
    >
      <Section id="overview" title="1. Overview">
        <p>
          If you believe content on Sweepr (for example, an uploaded photo, review,
          or profile image) infringes your copyright, you may submit a takedown
          notice as described below.
        </p>
      </Section>

      <Section id="takedown" title="2. Takedown Notices">
        <p>A valid notice should include:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Identification of the copyrighted work;</li>
          <li>Identification and location of the allegedly infringing material;</li>
          <li>Your contact information;</li>
          <li>A statement of good-faith belief that the use is unauthorized;</li>
          <li>A statement, under penalty of perjury, that the notice is accurate and you are authorized to act;</li>
          <li>Your physical or electronic signature.</li>
        </ul>
      </Section>

      <Section id="counter" title="3. Counter-Notices">
        <p>
          If your content was removed and you believe this was a mistake or
          misidentification, you may submit a counter-notice with the required
          information, including consent to jurisdiction and your signature.
        </p>
      </Section>

      <Section id="repeat" title="4. Repeat Infringers">
        <p>
          Sweepr may, in appropriate circumstances, disable or terminate accounts of
          users who are repeat infringers.
        </p>
      </Section>

      <Section id="agent" title="5. Designated Agent">
        <p>
          Send copyright notices to {COMPANY_NAME}, Attn: DMCA Agent,{" "}
          {REGISTERED_ADDRESS}, or by email to{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${LEGAL_EMAIL}`}>
            {LEGAL_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
