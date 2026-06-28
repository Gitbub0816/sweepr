// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "deadline", title: "Reporting Deadline" },
  { id: "evidence", title: "Required Evidence" },
  { id: "exclusions", title: "Exclusions" },
  { id: "process", title: "Investigation Process" },
  { id: "limits", title: "Claim Limits" },
  { id: "outcomes", title: "Possible Outcomes" },
  { id: "insurance", title: "Insurance Coordination" },
  { id: "disputes", title: "Disputes" },
];

export function DamageClaimsPolicy() {
  return (
    <DocPage
      title="Damage Claims Policy"
      version={DOC_VERSION}
      intro="This policy explains how to report property damage you believe was caused during a cleaning, what evidence is required, and how claims are reviewed. Opening a claim is not an admission of liability by Sweepr or any Cleaner."
      toc={toc}
    >
      <Section id="deadline" title="1. Reporting Deadline">
        <p>
          Report suspected damage as soon as possible and no later than 48 hours
          after the cleaning is completed (the "check-out" time). Claims reported
          after this window may be denied because the condition of the property
          can no longer be reliably verified.
        </p>
      </Section>

      <Section id="evidence" title="2. Required Evidence">
        <ul className="list-disc space-y-1 pl-6">
          <li>Clear photos of the damage;</li>
          <li>A written description of what happened;</li>
          <li>Proof of ownership and, where available, receipts;</li>
          <li>Repair or replacement estimates where applicable.</li>
        </ul>
        <p>
          Where reasonable, do not repair, alter, or dispose of the item before
          Sweepr has had an opportunity to review the claim.
        </p>
      </Section>

      <Section id="exclusions" title="3. Exclusions">
        <ul className="list-disc space-y-1 pl-6">
          <li>Pre-existing damage;</li>
          <li>Normal wear and tear;</li>
          <li>Fragile or improperly installed/mounted items;</li>
          <li>Items not reasonably secured by the customer;</li>
          <li>Damage outside the booked scope of work;</li>
          <li>Fraudulent or unsupported claims.</li>
        </ul>
      </Section>

      <Section id="process" title="4. Investigation Process">
        <p>
          Sweepr reviews the customer's submission, requests a statement from the
          Cleaner, and reviews before-and-after photos and communications. Sweepr
          may request additional information. Investigations are handled
          impartially and within a reasonable time.
        </p>
      </Section>

      <Section id="limits" title="5. Claim Limits">
        <p>
          Claim resolutions may be subject to maximum limits unless covered under
          an applicable insurance program described in the{" "}
          <Link className="text-seafoam-600 underline" to="/insurance-protection">
            Insurance &amp; Protection Policy
          </Link>
          . Sweepr does not guarantee payment of any claim.
        </p>
      </Section>

      <Section id="outcomes" title="6. Possible Outcomes">
        <ul className="list-disc space-y-1 pl-6">
          <li>Repair of the item;</li>
          <li>Replacement or depreciated value;</li>
          <li>Account credit;</li>
          <li>Referral to an insurance claim;</li>
          <li>Denial where the claim is excluded or unsupported.</li>
        </ul>
      </Section>

      <Section id="insurance" title="7. Insurance Coordination">
        <p>
          Where applicable, claims may be submitted to an insurance program and
          coordinated with any Cleaner-negligence process. See the{" "}
          <Link className="text-seafoam-600 underline" to="/insurance-protection">
            Insurance &amp; Protection Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="disputes" title="8. Disputes">
        <p>
          If you disagree with a claim decision, the{" "}
          <Link className="text-seafoam-600 underline" to="/dispute-resolution">
            Dispute Resolution
          </Link>{" "}
          process applies. To open a claim, contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
