import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL } from "../docs";

const toc = [
  { id: "commitment", title: "Our Commitment" },
  { id: "standards", title: "Standards" },
  { id: "measures", title: "Measures We Take" },
  { id: "feedback", title: "Feedback" },
];

export function Accessibility() {
  return (
    <DocPage
      title="Accessibility Statement"
      intro="Sweepr is committed to ensuring our platform is accessible to everyone, including people with disabilities."
      toc={toc}
    >
      <Section id="commitment" title="1. Our Commitment">
        <p>
          We believe everyone should be able to book and manage home cleaning
          with ease. We continually work to improve the accessibility of our
          website and applications.
        </p>
      </Section>

      <Section id="standards" title="2. Standards">
        <p>
          We aim to conform to the Web Content Accessibility Guidelines (WCAG)
          2.1 Level AA. These guidelines explain how to make web content more
          accessible to people with a wide range of disabilities.
        </p>
      </Section>

      <Section id="measures" title="3. Measures We Take">
        <ul className="list-disc space-y-1 pl-6">
          <li>Semantic HTML and ARIA attributes where appropriate;</li>
          <li>Sufficient color contrast and scalable text;</li>
          <li>Keyboard-navigable interfaces;</li>
          <li>Respect for reduced-motion preferences;</li>
          <li>Ongoing accessibility testing and review.</li>
        </ul>
      </Section>

      <Section id="feedback" title="4. Feedback">
        <p>
          If you encounter an accessibility barrier, please let us know at{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          so we can address it.
        </p>
      </Section>
    </DocPage>
  );
}
