// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { LEGAL_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "how", title: "How We Update Terms" },
  { id: "notice", title: "Notice of Material Changes" },
  { id: "fees", title: "Fee & Pricing Changes" },
  { id: "governance", title: "Internal Approval Governance" },
  { id: "versioning", title: "Versioning & Records" },
];

export function LegalUpdatesPolicy() {
  return (
    <DocPage
      title="Legal Updates Policy"
      version={DOC_VERSION}
      intro="This policy explains how Sweepr updates its legal terms and policies, the notice we provide, and the internal governance that applies to fee and pricing changes."
      toc={toc}
    >
      <Section id="how" title="1. How We Update Terms">
        <p>
          We may update our legal documents from time to time to reflect changes in
          our services, the law, or our practices. Updated documents are posted to
          the legal site with a new effective date and version.
        </p>
      </Section>

      <Section id="notice" title="2. Notice of Material Changes">
        <p>
          For material changes, we provide reasonable notice through one or more of:
          in-app notice, email, SMS, push notification, dashboard banner, the account
          notification center, or this legal updates page. Your continued use after
          an update's effective date constitutes acceptance, except where additional
          consent is required.
        </p>
      </Section>

      <Section id="fees" title="3. Fee & Pricing Changes">
        <p>
          Changes to fees and pricing follow the{" "}
          <Link className="text-seafoam-600 underline" to="/platform-fee-policy">
            Platform Fee Policy
          </Link>
          , including the customer-facing fee, cleaner payout-affecting fee, notice,
          and no-retroactive-reduction rules described there.
        </p>
      </Section>

      <Section id="governance" title="4. Internal Approval Governance">
        <p>
          Changes to platform fee and pricing configurations are governed by an
          internal approval workflow. At minimum:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Only a Super Admin may propose a change;</li>
          <li>
            The proposer plus at least one additional Super Admin must approve;
          </li>
          <li>
            Super Admins have a 72-hour response window to act; if no action is
            taken, the proposal is automatically declined and must be resubmitted;
          </li>
          <li>
            If any Super Admin proposes modifications or joins collaboration before
            the window expires, the 72-hour expiration no longer applies and all
            joined collaborators must approve the final version;
          </li>
          <li>
            An approved change must remain approved for a 48-hour cooldown; any
            modification or revocation resets the cooldown;
          </li>
          <li>
            After cooldown, affected parties receive at least 14 calendar days'
            notice before the change takes effect, unless a longer period is required
            by law or a later effective date is selected;
          </li>
          <li>
            Effective changes take effect at 11:59 PM platform local time on the
            effective date, and every action is recorded in an immutable audit log.
          </li>
        </ul>
      </Section>

      <Section id="versioning" title="5. Versioning & Records">
        <p>
          We retain versions and effective dates of our legal documents and record
          user acceptances where required. Questions?{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${LEGAL_EMAIL}`}>
            {LEGAL_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
