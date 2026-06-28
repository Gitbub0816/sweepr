// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { COMPANY_NAME, SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "status", title: "Independent Contractor Status" },
  { id: "eligibility", title: "Eligibility & Onboarding" },
  { id: "screening", title: "Identity & Background Checks" },
  { id: "supplies", title: "Equipment & Supplies" },
  { id: "standards", title: "Service Standards" },
  { id: "jobs", title: "Accepting & Declining Jobs" },
  { id: "conduct", title: "Customer Contact & Off-Platform" },
  { id: "confidentiality", title: "Address & Access Confidentiality" },
  { id: "dayof", title: "Day-of-Service Requirements" },
  { id: "safety", title: "Safety Refusal Rights" },
  { id: "damage", title: "Customer Property & Negligence" },
  { id: "payouts", title: "Payouts, Holds & Reversals" },
  { id: "ratings", title: "Ratings & Deactivation" },
  { id: "benefits", title: "No Employee Benefits" },
  { id: "related", title: "Related Policies" },
];

export function CleanerPlatformAgreement() {
  return (
    <DocPage
      title="Cleaner Platform Agreement"
      version={DOC_VERSION}
      intro="This Agreement governs your use of Sweepr as an independent cleaner ('Cleaner' or 'Sweepr Pro'). It supplements the Terms of Service and the Independent Contractor Agreement."
      toc={toc}
    >
      <Section id="status" title="1. Independent Contractor Status">
        <p>
          You operate an independent cleaning business and use Sweepr to find and
          manage work. You are an independent contractor, not an employee, agent,
          partner, or joint venturer of {COMPANY_NAME}. You control how you
          perform cleanings, set your own schedule and service area, and may work
          for others. See the{" "}
          <Link className="text-seafoam-600 underline" to="/contractor-agreement">
            Independent Contractor Agreement
          </Link>
          .
        </p>
      </Section>

      <Section id="eligibility" title="2. Eligibility & Onboarding">
        <p>
          You must be legally able to work, meet onboarding requirements, and
          provide accurate information. Sweepr may decline or remove applicants who
          do not meet platform standards.
        </p>
      </Section>

      <Section id="screening" title="3. Identity & Background Checks">
        <p>
          Onboarding includes identity verification and a background check through
          a third-party vendor, subject to your separate disclosure and
          authorization. See the{" "}
          <Link className="text-seafoam-600 underline" to="/background-check-disclosure">
            Background Check Disclosure
          </Link>
          ,{" "}
          <Link className="text-seafoam-600 underline" to="/background-check-authorization">
            Authorization
          </Link>
          , and{" "}
          <Link className="text-seafoam-600 underline" to="/background-check-adverse-action">
            Adverse Action Policy
          </Link>
          . Sweepr may periodically re-check eligibility.
        </p>
      </Section>

      <Section id="supplies" title="4. Equipment & Supplies">
        <p>
          You are responsible for your own supplies, equipment, and transportation
          unless a booking expressly states that the customer provides supplies.
          You are responsible for the maintenance and breakage of your own tools.
        </p>
      </Section>

      <Section id="standards" title="5. Service Standards">
        <p>
          You agree to perform Services competently, professionally, and within
          the booked scope described in the{" "}
          <Link className="text-seafoam-600 underline" to="/service-scope">
            Service Scope Policy
          </Link>
          , and to follow the{" "}
          <Link className="text-seafoam-600 underline" to="/community-guidelines">
            Community Guidelines
          </Link>
          .
        </p>
      </Section>

      <Section id="jobs" title="6. Accepting & Declining Jobs">
        <p>
          You may accept or decline any job. There is no minimum-work guarantee, no
          guaranteed earnings, and no exclusivity. Payout for a job is shown before
          you accept it.
        </p>
      </Section>

      <Section id="conduct" title="7. Customer Contact & Off-Platform Solicitation">
        <p>
          Communicate with customers through Sweepr's masked phone and in-app chat.
          Soliciting customers to transact off-platform, sharing personal contact
          information to bypass Sweepr, or arranging private side deals is
          prohibited and may result in removal and enforcement of amounts owed.
        </p>
      </Section>

      <Section id="confidentiality" title="8. Address & Access Confidentiality">
        <p>
          Customer addresses, entry codes, and access instructions are
          confidential, may be used only to perform the specific job, and must not
          be retained or shared. Confidentiality obligations survive termination.
        </p>
      </Section>

      <Section id="dayof" title="9. Day-of-Service Requirements">
        <ul className="list-disc space-y-1 pl-6">
          <li>Check in and check out through the app;</li>
          <li>Share location during active jobs for status updates and safety;</li>
          <li>Take before-and-after photos where required;</li>
          <li>Report incidents promptly.</li>
        </ul>
      </Section>

      <Section id="safety" title="10. Safety Refusal Rights">
        <p>
          You may decline or stop work in unsafe conditions. See the{" "}
          <Link className="text-seafoam-600 underline" to="/trust-safety">
            Trust &amp; Safety Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="damage" title="11. Customer Property & Negligence">
        <p>
          You are responsible for damage caused by your negligence or willful
          misconduct and agree to cooperate with the{" "}
          <Link className="text-seafoam-600 underline" to="/damage-claims">
            Damage Claims Policy
          </Link>
          . Sweepr may offset or recover validated negligence amounts consistent
          with applicable law and this Agreement.
        </p>
      </Section>

      <Section id="payouts" title="12. Payouts, Holds & Reversals">
        <p>
          Payouts are processed through Stripe Connect under the{" "}
          <Link className="text-seafoam-600 underline" to="/payment-terms">
            Payment Services Terms
          </Link>
          . Sweepr may hold or reverse payouts for fraud, chargebacks, breach,
          validated damage claims, or as required by law. Sweepr will not
          retroactively reduce payout for a booking you already accepted before an
          effective fee change, except as permitted under the{" "}
          <Link className="text-seafoam-600 underline" to="/platform-fee-policy">
            Platform Fee Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="ratings" title="13. Ratings & Deactivation">
        <p>
          Ratings and compliance affect your tier and standing. Sweepr may suspend
          or deactivate accounts for safety, fraud, repeated low quality, or policy
          violations, with an opportunity to respond where appropriate.
        </p>
      </Section>

      <Section id="benefits" title="14. No Employee Benefits">
        <p>
          As an independent contractor, you are not entitled to workers'
          compensation, unemployment insurance, or employee benefits from Sweepr,
          and you are responsible for your own taxes, licenses, and permits. See
          the{" "}
          <Link className="text-seafoam-600 underline" to="/tax-reporting">
            Tax Reporting Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="related" title="15. Related Policies">
        <ul className="list-disc space-y-1 pl-6">
          <li><Link className="text-seafoam-600 underline" to="/contractor-agreement">Independent Contractor Agreement</Link></li>
          <li><Link className="text-seafoam-600 underline" to="/insurance-protection">Insurance &amp; Protection Policy</Link></li>
          <li><Link className="text-seafoam-600 underline" to="/tax-reporting">Tax Reporting Policy</Link></li>
          <li><Link className="text-seafoam-600 underline" to="/trust-safety">Trust &amp; Safety Policy</Link></li>
          <li><Link className="text-seafoam-600 underline" to="/payment-terms">Payment Services Terms</Link></li>
        </ul>
        <p>
          Cleaner support:{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
