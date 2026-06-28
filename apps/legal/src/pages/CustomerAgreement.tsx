// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { COMPANY_NAME, SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "who", title: "Who You Contract With" },
  { id: "platform", title: "Platform vs. Cleaning Services" },
  { id: "booking", title: "Booking Process" },
  { id: "access", title: "Property Access & Safety" },
  { id: "valuables", title: "Valuables & Hazards" },
  { id: "refusal", title: "Cleaner Right to Refuse" },
  { id: "photos", title: "Photo Documentation" },
  { id: "limits", title: "Service Limitations" },
  { id: "recurring", title: "Recurring Bookings" },
  { id: "cancellation", title: "Cancellation & No-Show" },
  { id: "claims", title: "Damage Claims & Refunds" },
  { id: "chargebacks", title: "Chargebacks" },
  { id: "consents", title: "Communications & Consents" },
  { id: "related", title: "Related Policies" },
];

export function CustomerAgreement() {
  return (
    <DocPage
      title="Customer Agreement"
      version={DOC_VERSION}
      intro="This Customer Agreement governs your use of Sweepr as a customer booking cleaning services. It supplements the Terms of Service. Capitalized terms have the meanings given in the Terms of Service."
      toc={toc}
    >
      <Section id="who" title="1. Who You Contract With">
        <p>
          The Sweepr platform is operated by {COMPANY_NAME} ("Sweepr", "we",
          "us"). When you book through Sweepr, you enter into this Customer
          Agreement with Sweepr for use of the Platform, and a separate service
          relationship with the independent cleaner ("Cleaner" or "Sweepr Pro")
          who performs the cleaning.
        </p>
      </Section>

      <Section id="platform" title="2. Platform vs. Cleaning Services">
        <p>
          Sweepr provides a technology platform that connects customers with
          independent Cleaners. Sweepr is not a cleaning company and does not
          itself perform cleaning services. Cleaners are independent contractors,
          not employees or agents of Sweepr. Sweepr may set or suggest
          customer-facing prices but does not direct the manner or means by which
          a Cleaner performs a cleaning.
        </p>
      </Section>

      <Section id="booking" title="3. Booking Process">
        <p>
          When you request a booking, you provide details about your home and the
          service requested and receive a price. The price and any applicable
          fees are displayed before you confirm. By confirming, you authorize
          payment of the amount shown and agree to the applicable policies. A
          booking is not guaranteed until a Cleaner is matched and the booking is
          confirmed.
        </p>
      </Section>

      <Section id="access" title="4. Property Access & Safe Premises">
        <p>You are responsible, before the Cleaner's arrival, for:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>providing an accurate service address and access instructions;</li>
          <li>ensuring safe, lawful, and reasonable access to the home;</li>
          <li>
            disclosing pets, hazards, weapons, biohazards, mold, pests, illegal
            activity, or dangerous materials present at the property;
          </li>
          <li>
            providing a safe working environment free of threats, harassment, or
            unsafe conditions.
          </li>
        </ul>
        <p>
          You authorize the assigned Cleaner to enter the premises for the
          purpose of performing the Services on the scheduled date and time.
        </p>
      </Section>

      <Section id="valuables" title="5. Valuables, Fragile Items & Hazards">
        <p>
          You are responsible for securing cash, jewelry, prescriptions, weapons,
          private documents, and irreplaceable, fragile, or high-value items
          before the cleaning. Sweepr and Cleaners are not responsible for items
          that were not reasonably secured, except as provided in the{" "}
          <Link className="text-seafoam-600 underline" to="/damage-claims">
            Damage Claims Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="refusal" title="6. Cleaner Right to Refuse Unsafe Work">
        <p>
          Cleaners may decline or stop work in conditions that are unsafe,
          unsanitary beyond the booked scope, or that involve hazards, aggressive
          animals, harassment, or unlawful activity. See the{" "}
          <Link className="text-seafoam-600 underline" to="/trust-safety">
            Trust &amp; Safety Policy
          </Link>{" "}
          and{" "}
          <Link className="text-seafoam-600 underline" to="/service-scope">
            Service Scope Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="photos" title="7. Photo Documentation">
        <p>
          Cleaners may take before-and-after photos to document the condition of
          the home and the work performed. These photos may be used for quality
          assurance, dispute resolution, and claims handling, and are handled in
          accordance with the{" "}
          <Link className="text-seafoam-600 underline" to="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="limits" title="8. Service Limitations">
        <p>
          Standard cleaning does not include every possible task. What is and is
          not included is described in the{" "}
          <Link className="text-seafoam-600 underline" to="/service-scope">
            Service Scope Policy
          </Link>
          . Additional tasks may require add-ons or a different service type and
          may change the price.
        </p>
      </Section>

      <Section id="recurring" title="9. Recurring Bookings">
        <p>
          If you select a recurring cadence, the{" "}
          <Link className="text-seafoam-600 underline" to="/subscription-terms">
            Subscription Terms
          </Link>{" "}
          apply, including billing timing, rescheduling, skipped visits, and
          cancellation.
        </p>
      </Section>

      <Section id="cancellation" title="10. Cancellation, No-Show & Lockout">
        <p>
          Cancellation windows, no-show charges, lockout/no-access charges, and
          rescheduling are governed by the{" "}
          <Link className="text-seafoam-600 underline" to="/refund-policy">
            Refund &amp; Cancellation Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="claims" title="11. Damage Claims & Refunds">
        <p>
          Claims for property damage must be reported within the deadline and
          with the evidence described in the{" "}
          <Link className="text-seafoam-600 underline" to="/damage-claims">
            Damage Claims Policy
          </Link>
          . Service-quality concerns and re-clean requests are handled under the{" "}
          <Link className="text-seafoam-600 underline" to="/refund-policy">
            Refund Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="chargebacks" title="12. Chargebacks">
        <p>
          If you initiate a chargeback, Sweepr may investigate and present
          evidence (including before-and-after photos and communications).
          Fraudulent or bad-faith chargebacks may result in account suspension
          and collection of amounts owed.
        </p>
      </Section>

      <Section id="consents" title="13. Communications & Consents">
        <p>By using Sweepr, you consent to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>platform communications about your bookings;</li>
          <li>masked calling and in-app chat with your Cleaner;</li>
          <li>
            geolocation-based service status updates (for example, "Cleaner on
            the way") during active jobs.
          </li>
        </ul>
        <p>
          SMS marketing is optional and governed by the{" "}
          <Link className="text-seafoam-600 underline" to="/sms-policy">
            SMS Policy
          </Link>
          . Electronic communications and signatures are governed by the{" "}
          <Link className="text-seafoam-600 underline" to="/e-sign">
            E-Sign Consent
          </Link>
          .
        </p>
      </Section>

      <Section id="related" title="14. Related Policies">
        <ul className="list-disc space-y-1 pl-6">
          <li><Link className="text-seafoam-600 underline" to="/terms">Terms of Service</Link></li>
          <li><Link className="text-seafoam-600 underline" to="/privacy">Privacy Policy</Link></li>
          <li><Link className="text-seafoam-600 underline" to="/refund-policy">Refund &amp; Cancellation Policy</Link></li>
          <li><Link className="text-seafoam-600 underline" to="/service-scope">Service Scope Policy</Link></li>
          <li><Link className="text-seafoam-600 underline" to="/damage-claims">Damage Claims Policy</Link></li>
          <li><Link className="text-seafoam-600 underline" to="/dispute-resolution">Dispute Resolution</Link></li>
          <li><Link className="text-seafoam-600 underline" to="/community-guidelines">Community Guidelines</Link></li>
        </ul>
        <p>
          Questions? Contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
