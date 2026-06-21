import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL } from "../docs";

const toc = [
  { id: "cancellation", title: "Cancellation Windows" },
  { id: "sameday", title: "Same-Day Cancellation" },
  { id: "guarantee", title: "Satisfaction Guarantee" },
  { id: "subscriptions", title: "Subscription Cancellations" },
  { id: "disputes", title: "Disputes" },
  { id: "contact", title: "Contact" },
];

export function RefundPolicy() {
  return (
    <DocPage
      title="Refund Policy"
      intro="This Refund Policy explains cancellations, refunds, and our satisfaction guarantee for cleanings booked through Sweepr."
      toc={toc}
    >
      <Section id="cancellation" title="1. Cancellation Windows">
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>More than 24 hours</strong> before the scheduled start: full
            refund.
          </li>
          <li>
            <strong>12–24 hours</strong> before the scheduled start: 50% refund.
          </li>
          <li>
            <strong>Less than 12 hours</strong> before the scheduled start: no
            refund (the cleaner earns their portion).
          </li>
        </ul>
      </Section>

      <Section id="sameday" title="2. Same-Day Cancellation">
        <p>
          Same-day cancellations are not eligible for a refund, as cleaners have
          reserved the time and may have declined other work.
        </p>
      </Section>

      <Section id="guarantee" title="3. Satisfaction Guarantee">
        <p>
          If a cleaning is unsatisfactory, report the issue within 48 hours of
          completion. We will arrange a complimentary re-clean or, at our
          discretion, issue a partial or full refund.
        </p>
      </Section>

      <Section id="subscriptions" title="4. Subscription Cancellations">
        <p>
          You may cancel a subscription at any time. Charges already incurred for
          a confirmed upcoming visit are subject to the cancellation windows
          above. Any prepaid, unused portion is prorated and refunded where
          applicable.
        </p>
      </Section>

      <Section id="disputes" title="5. Disputes">
        <p>
          If you disagree with a refund decision, please see our{" "}
          <a className="text-seafoam-600 underline" href="/dispute-resolution">
            Dispute Resolution policy
          </a>
          .
        </p>
      </Section>

      <Section id="contact" title="6. Contact">
        <p>
          To request a refund or report an issue, contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
