/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

// NOTE: Keep these terms reconciled with Sweepr's actual policies and coverage.
import { Link } from "react-router";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "overview", title: "Overview" },
  { id: "covered", title: "What May Be Covered" },
  { id: "excluded", title: "What Is Not Covered" },
  { id: "theft", title: "Theft Claims" },
  { id: "process", title: "Claims Process" },
  { id: "cleaner", title: "Cleaner Insurance Requirement" },
  { id: "customer", title: "Customer Insurance" },
  { id: "nobeneficiary", title: "No Third-Party Beneficiary" },
];

export function InsuranceProtectionPolicy() {
  return (
    <DocPage
      title="Insurance & Protection Policy"
      version={DOC_VERSION}
      intro="This policy describes Sweepr's protection structure and its limits. It does not create insurance coverage for any person and does not guarantee payment of any claim."
      toc={toc}
    >
      <Section id="overview" title="1. Overview">
        <p>
          Sweepr may maintain commercial general liability coverage relating to its
          platform operations. The existence of any policy does not make Sweepr an
          insurer of Cleaners or customers and does not guarantee that a particular
          claim will be paid.
        </p>
        <p>
          Sweepr does not sell, provide, procure, or administer insurance for
          Cleaners or customers, and offers no coverage plan, program, or
          enrollment of its own. Cleaners carry their own policies, purchased in
          their own business's name from an insurer they choose. Sweepr may link
          to a third-party insurance partner as a convenience; a policy bought
          through such a link is a contract between the Cleaner and that insurer
          alone, and is not a Sweepr policy.
        </p>
      </Section>

      <Section id="covered" title="2. What May Be Covered">
        <p>
          Subject to the terms, limits, and exclusions of any applicable policy,
          certain validated property-damage claims arising from a cleaning may be
          eligible for consideration, coordinated with the{" "}
          <Link className="text-seafoam-700 underline" to="/damage-claims">
            Damage Claims Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="excluded" title="3. What Is Not Covered">
        <ul className="list-disc space-y-1 pl-6">
          <li>Customer fraud or misrepresentation;</li>
          <li>Intentional acts or willful misconduct;</li>
          <li>Pre-existing damage and normal wear and tear;</li>
          <li>Items not reasonably secured;</li>
          <li>Cleaner tools/equipment, unless expressly offered;</li>
          <li>Amounts beyond applicable policy limits or any self-insured retention/deductible.</li>
        </ul>
      </Section>

      <Section id="theft" title="4. Theft Claims">
        <p>
          Theft claims require a police report and cooperation with the
          investigation. False claims are prohibited and may result in account
          action.
        </p>
      </Section>

      <Section id="process" title="5. Claims Process">
        <p>
          Claims are investigated under the{" "}
          <Link className="text-seafoam-700 underline" to="/damage-claims">
            Damage Claims Policy
          </Link>
          , including review of before-and-after photos and a Cleaner statement.
          Opening a claim is not an admission of liability.
        </p>
      </Section>

      <Section id="cleaner" title="6. Cleaner Insurance Requirement">
        <p>
          Cleaners must maintain their own general liability insurance and keep it
          in force for as long as they accept jobs on Sweepr. Coverage must meet
          the minimum Sweepr specifies during onboarding, currently at least
          $500,000 per occurrence, and Sweepr may change that minimum. A Cleaner
          must submit a certificate of insurance or declarations page for review,
          and may not accept jobs until that coverage is reviewed and approved, or
          after it lapses or expires.
        </p>
        <p>
          Cleaners remain responsible for damage caused by their negligence or
          misconduct as described in the{" "}
          <Link className="text-seafoam-700 underline" to="/cleaner-agreement">
            Cleaner Platform Agreement
          </Link>
          .
        </p>
      </Section>

      <Section id="customer" title="7. Customer Insurance">
        <p>
          Customers are encouraged to maintain homeowner's or renter's insurance.
          Sweepr's protection structure is not a substitute for personal insurance.
        </p>
      </Section>

      <Section id="nobeneficiary" title="8. No Third-Party Beneficiary">
        <p>
          No person is a third-party beneficiary of any Sweepr insurance policy by
          virtue of this document. Questions? Contact{" "}
          <a className="text-seafoam-700 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
