// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "customer-fees", title: "Customer-Facing Fees" },
  { id: "cleaner-fees", title: "Cleaner Platform Fees & Commissions" },
  { id: "notice", title: "Notice of Fee Changes" },
  { id: "no-retro", title: "No Retroactive Fee Reductions" },
  { id: "pricing", title: "Cleaning Service Pricing" },
  { id: "approval", title: "Internal Approval of Fee Changes" },
];

export function PlatformFeePolicy() {
  return (
    <DocPage
      title="Platform Fee Policy"
      version={DOC_VERSION}
      intro="This policy explains how Sweepr's customer-facing fees and cleaner platform fees work, how they may change, and the notice that applies. It supplements the Terms of Service, Customer Agreement, and Cleaner Platform Agreement."
      toc={toc}
    >
      <Section id="customer-fees" title="1. Customer-Facing Fees">
        <p>
          Sweepr may charge service fees, booking fees, marketplace fees,
          cancellation fees, adjustment fees, or other customer-facing charges in
          connection with use of the Platform.
        </p>
        <p>
          Applicable fees may vary based on service type, location, cleaner
          availability, demand, promotional offers, operating costs, taxes,
          third-party processing costs, or other marketplace factors.
        </p>
        <p>
          Before a Customer confirms a booking, Sweepr will display the applicable
          price and any customer-facing fees then available for that transaction.
          By confirming the booking, the Customer agrees to the fees shown at
          checkout.
        </p>
        <p>
          Fee changes do not apply retroactively to bookings that have already been
          confirmed, unless the change is required by law, caused by a
          Customer-requested modification, or otherwise disclosed and accepted by
          the Customer.
        </p>
      </Section>

      <Section id="cleaner-fees" title="2. Cleaner Platform Fees & Commission Changes">
        <p>
          Sweepr may charge platform fees, commissions, marketplace fees,
          insurance-related administrative fees, or other fees that affect Cleaner
          payouts.
        </p>
        <p>
          Sweepr may modify these fees from time to time. Unless otherwise required
          by law or expressly stated, changes to Cleaner payout-affecting fees will
          apply only to future bookings and will not reduce payment for bookings
          already accepted by a Cleaner before the effective date of the change.
        </p>
        <p>
          For material changes to Cleaner platform fees, commission rates, payout
          formulas, or other payout-affecting charges, Sweepr will provide
          reasonable advance notice through the Platform, email, SMS, push
          notification, or other reasonable method. Unless a longer notice period
          is legally required, Sweepr will provide at least fourteen (14) calendar
          days' notice before a material payout-affecting fee change takes effect.
        </p>
      </Section>

      <Section id="notice" title="3. Notice of Fee Changes">
        <p>
          Sweepr may provide notice of material fee changes through one or more of:
          in-app notice, email, SMS, push notification, dashboard banner, account
          notification center, the legal updates page, or other reasonable
          electronic notice.
        </p>
        <p>
          For Cleaner payout-affecting fee changes, Sweepr will provide at least
          fourteen (14) calendar days' notice before the change takes effect,
          unless the change is legally required, decreases fees, improves Cleaner
          payouts, corrects an error, or applies only to future optional programs.
        </p>
      </Section>

      <Section id="no-retro" title="4. No Retroactive Fee Reductions">
        <p>
          Sweepr will not apply a platform fee, commission increase, or
          payout-affecting change retroactively to reduce payment owed for a
          booking already accepted by a Cleaner before the effective date of the
          change, except where required by law, caused by fraud, chargeback,
          correction of an error, violation of Platform rules, or other expressly
          permitted adjustment under the applicable agreement.
        </p>
      </Section>

      <Section id="pricing" title="5. Cleaning Service Pricing">
        <p>
          Sweepr uses pricing rules that may consider factors such as service
          location, property type, home size, number of bedrooms and bathrooms,
          selected service type, requested add-ons, cleaner availability, requested
          timing, recurring service frequency, promotions, and other marketplace
          factors.
        </p>
        <p>
          The price shown before checkout is the price applicable to the booking at
          that time, subject to Customer-requested modifications, inaccurate
          information, additional requested services, cancellation fees, taxes, or
          other disclosed adjustments. Pricing updates apply prospectively and do
          not automatically change the price of a booking already confirmed, unless
          the Customer modifies the booking or an adjustment is permitted under the
          applicable agreement.
        </p>
      </Section>

      <Section id="approval" title="6. Internal Approval of Fee Configuration Changes">
        <p>
          Changes to Sweepr platform fee and pricing configurations may only be
          proposed by a Super Admin and must be reviewed and approved through
          Sweepr's internal approval workflow before becoming effective. At
          minimum, that workflow includes the original proposer, at least one
          additional Super Admin approver, a 72-hour response window, a
          collaboration process for proposed modifications, a 48-hour post-approval
          cooldown, and a 14-calendar-day notice period to affected parties before
          the change takes effect (unless a longer period is required by law or a
          later effective date is selected). Effective changes take effect at
          11:59 PM platform local time on the effective date unless otherwise
          required. This internal governance is described further in the{" "}
          <Link className="text-seafoam-600 underline" to="/legal-updates">
            Legal Updates Policy
          </Link>
          .
        </p>
        <p>
          Questions about fees? Contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
