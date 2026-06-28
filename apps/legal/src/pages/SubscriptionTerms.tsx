// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "cadence", title: "Recurring Cadence" },
  { id: "billing", title: "Billing & Authorization" },
  { id: "pricing", title: "Price Changes" },
  { id: "reschedule", title: "Rescheduling & Skips" },
  { id: "pause", title: "Pause" },
  { id: "cancellation", title: "Cancellation" },
  { id: "failed", title: "Failed Payments" },
  { id: "reassignment", title: "Cleaner Reassignment" },
  { id: "noguarantee", title: "No Long-Term Guarantee" },
];

export function SubscriptionTerms() {
  return (
    <DocPage
      title="Subscription Terms"
      version={DOC_VERSION}
      intro="These terms apply when you book recurring (subscription) cleaning services through Sweepr. They supplement the Customer Agreement and Refund Policy."
      toc={toc}
    >
      <Section id="cadence" title="1. Recurring Cadence">
        <p>
          You may select a recurring cadence (for example weekly, biweekly, or
          monthly). Each scheduled visit creates an individual booking subject to
          the{" "}
          <Link className="text-seafoam-600 underline" to="/customer-agreement">
            Customer Agreement
          </Link>
          .
        </p>
      </Section>

      <Section id="billing" title="2. Billing & Authorization">
        <p>
          By starting a recurring plan, you authorize Sweepr (through its payment
          processor) to charge your payment method for each visit at the time
          disclosed at sign-up (for example, before or at the time of each
          service). See the{" "}
          <Link className="text-seafoam-600 underline" to="/payment-terms">
            Payment Services Terms
          </Link>
          .
        </p>
      </Section>

      <Section id="pricing" title="3. Price Changes">
        <p>
          Recurring prices may change for future visits. Material changes are
          disclosed in advance under the{" "}
          <Link className="text-seafoam-600 underline" to="/platform-fee-policy">
            Platform Fee Policy
          </Link>{" "}
          and apply only to visits after the effective date. The price for any
          visit is shown before that visit is charged.
        </p>
      </Section>

      <Section id="reschedule" title="4. Rescheduling & Skipped Visits">
        <p>
          You may reschedule or skip an upcoming visit within the windows shown in
          the app. Late changes may be subject to the cancellation rules in the{" "}
          <Link className="text-seafoam-600 underline" to="/refund-policy">
            Refund Policy
          </Link>
          . Holiday scheduling may shift a visit; you will be notified.
        </p>
      </Section>

      <Section id="pause" title="5. Pause">
        <p>
          Where available, you may pause a plan for a limited period. Paused plans
          do not bill until resumed. Cleaner availability on resumption is not
          guaranteed.
        </p>
      </Section>

      <Section id="cancellation" title="6. Cancellation">
        <p>
          You may cancel a recurring plan at any time through the app or by
          contacting support. Cancellation stops future visits; it does not refund
          a visit already performed. You will receive confirmation of
          cancellation.
        </p>
      </Section>

      <Section id="failed" title="7. Failed Payments">
        <p>
          If a payment fails, Sweepr may retry, pause the plan, or cancel upcoming
          visits, and may require a valid payment method before resuming.
        </p>
      </Section>

      <Section id="reassignment" title="8. Cleaner Reassignment">
        <p>
          Sweepr aims to keep you with the same Cleaner where possible but does not
          guarantee a specific Cleaner for recurring visits. A different qualified
          Cleaner may be assigned.
        </p>
      </Section>

      <Section id="noguarantee" title="9. No Long-Term Service Guarantee">
        <p>
          Recurring plans are not a guarantee of indefinite service. Sweepr or the
          Cleaner may decline future bookings consistent with the Terms. Questions?
          Contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
