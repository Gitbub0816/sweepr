// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "respect", title: "Respectful Conduct" },
  { id: "integrity", title: "Honesty & Review Integrity" },
  { id: "no-poaching", title: "No Off-Platform Poaching" },
  { id: "communication", title: "Communication Standards" },
  { id: "enforcement", title: "Enforcement Ladder" },
];

export function CommunityGuidelines() {
  return (
    <DocPage
      title="Community Guidelines"
      version={DOC_VERSION}
      intro="These guidelines describe the behavior expected of everyone on Sweepr. They work together with the Trust & Safety Policy and Acceptable Use Policy."
      toc={toc}
    >
      <Section id="respect" title="1. Respectful Conduct">
        <ul className="list-disc space-y-1 pl-6">
          <li>Treat others with respect and professionalism;</li>
          <li>No harassment, discrimination, threats, or intimidation;</li>
          <li>No inappropriate or offensive content.</li>
        </ul>
      </Section>

      <Section id="integrity" title="2. Honesty & Review Integrity">
        <p>
          Provide accurate information and genuine reviews. Manipulating reviews,
          retaliating for honest feedback, or posting fake content is prohibited.
          See the{" "}
          <Link className="text-seafoam-600 underline" to="/reviews">
            Review Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="no-poaching" title="3. No Off-Platform Poaching or Side Deals">
        <p>
          Do not solicit or arrange cleaning services outside the Platform with
          people you met through Sweepr, and do not share private contact details to
          bypass Sweepr.
        </p>
      </Section>

      <Section id="communication" title="4. Communication Standards">
        <p>
          Keep booking-related communication within Sweepr's masked phone and chat.
          Communications should be courteous and relevant to the service.
        </p>
      </Section>

      <Section id="enforcement" title="5. Enforcement Ladder">
        <p>
          Depending on severity, violations may result in warnings, temporary
          suspension, removal of content, or permanent deactivation. Serious safety
          violations may result in immediate removal. Report issues to{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
