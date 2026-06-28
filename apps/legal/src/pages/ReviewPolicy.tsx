// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "genuine", title: "Genuine Experiences Only" },
  { id: "prohibited", title: "Prohibited Practices" },
  { id: "moderation", title: "Moderation" },
  { id: "removal", title: "When Reviews May Be Removed" },
  { id: "appeal", title: "Appeals" },
  { id: "ratings", title: "Ratings & Cleaner Status" },
];

export function ReviewPolicy() {
  return (
    <DocPage
      title="Review Policy"
      version={DOC_VERSION}
      intro="Reviews help the Sweepr community make informed choices. This policy requires honest reviews and prohibits deceptive review practices, consistent with applicable law including the FTC's rules on reviews and testimonials."
      toc={toc}
    >
      <Section id="genuine" title="1. Genuine Experiences Only">
        <p>
          Reviews must reflect a genuine, first-hand experience with the service.
        </p>
      </Section>

      <Section id="prohibited" title="2. Prohibited Practices">
        <ul className="list-disc space-y-1 pl-6">
          <li>Fake reviews or reviews for services not received;</li>
          <li>Paid or incentivized reviews without clear disclosure;</li>
          <li>Insider or employee reviews without disclosure;</li>
          <li>AI-generated fake customer reviews;</li>
          <li>Review extortion or threats to post/remove reviews;</li>
          <li>Manipulating ratings or suppressing reviews merely for being negative.</li>
        </ul>
      </Section>

      <Section id="moderation" title="3. Moderation">
        <p>
          Sweepr may moderate reviews that violate this policy, contain unlawful or
          off-topic content, reveal private information, or are not genuine. Sweepr
          does not remove reviews simply because they are critical.
        </p>
      </Section>

      <Section id="removal" title="4. When Reviews May Be Removed">
        <ul className="list-disc space-y-1 pl-6">
          <li>Harassment, hate speech, or threats;</li>
          <li>Private or personal information;</li>
          <li>Fraudulent, fake, or undisclosed-incentive reviews;</li>
          <li>Content unrelated to the service experience.</li>
        </ul>
      </Section>

      <Section id="appeal" title="5. Appeals">
        <p>
          If you believe a moderation decision was incorrect, you may appeal by
          contacting{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section id="ratings" title="6. Ratings & Cleaner Status">
        <p>
          Aggregate ratings may affect a Cleaner's tier and standing, as described
          in the{" "}
          <Link className="text-seafoam-600 underline" to="/cleaner-agreement">
            Cleaner Platform Agreement
          </Link>
          . Review manipulation is itself a violation that may affect standing.
        </p>
      </Section>
    </DocPage>
  );
}
