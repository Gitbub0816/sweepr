/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Link } from "react-router";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "processor", title: "Payment Processor" },
  { id: "customer-auth", title: "Customer Payment Authorization" },
  { id: "saved", title: "Saved Payment Methods" },
  { id: "recurring", title: "Recurring Billing" },
  { id: "collection", title: "Collection on Behalf of Cleaners" },
  { id: "connect", title: "Cleaner Connected Accounts" },
  { id: "payouts", title: "Payouts, Holds & Reserves" },
  { id: "chargebacks", title: "Chargebacks & Refunds" },
  { id: "negative", title: "Negative Balances" },
  { id: "kyc", title: "Identity, KYC & Sanctions" },
  { id: "fees", title: "Fees" },
];

export function PaymentServicesTerms() {
  return (
    <DocPage
      title="Payment Services Terms"
      version={DOC_VERSION}
      intro="These terms describe how payments, payouts, and related processing work on Sweepr. They supplement the Terms of Service, Customer Agreement, and Cleaner Platform Agreement."
      toc={toc}
    >
      <Section id="processor" title="1. Payment Processor">
        <p>
          Payments and payouts are processed by Stripe, including Stripe Connect.
          Your use of payment services is also subject to Stripe's applicable
          terms. Sweepr does not store full card numbers.
        </p>
      </Section>

      <Section id="customer-auth" title="2. Customer Payment Authorization">
        <p>
          When you confirm a booking, you authorize a charge to your payment method
          for the amount shown, including applicable fees and taxes, and for
          permitted post-service adjustments (for example, customer-requested
          add-ons or disclosed cancellation fees) under the{" "}
          <Link className="text-seafoam-700 underline" to="/refund-policy">
            Refund Policy
          </Link>
          .
        </p>
        <p>
          <strong>Pre-authorization hold.</strong> When you confirm a booking,
          we place a temporary authorization hold on your payment method for
          the booking amount. The hold may appear on your statement as a
          pending charge and may reduce your available balance, but it is not
          a completed payment. The payment is captured only after the cleaning
          is completed (or as otherwise provided in the Refund Policy, for
          example disclosed cancellation fees). If a booking is cancelled and
          no fee applies, the hold is released; your bank determines how
          quickly a released hold disappears from your statement, typically
          within a few business days.
        </p>
      </Section>

      <Section id="saved" title="3. Saved Payment Methods">
        <p>
          A payment method may be securely saved with the processor to streamline
          future bookings. You can manage saved methods in the app.
        </p>
      </Section>

      <Section id="recurring" title="4. Recurring Billing">
        <p>
          For recurring plans, you authorize charges for each visit as described in
          the{" "}
          <Link className="text-seafoam-700 underline" to="/subscription-terms">
            Subscription Terms
          </Link>
          .
        </p>
      </Section>

      <Section id="collection" title="5. Collection on Behalf of Cleaners">
        <p>
          Each customer charge is a single payment that Sweepr allocates
          internally among the Cleaner's earnings for the service, Sweepr's
          Marketplace Services Fee, applicable taxes and fees, tips, and any
          adjustments.
          Sweepr, through its payment processor, collects the Cleaner's
          earnings as the Cleaner's limited payment collection agent under the
          Independent Contractor Agreement. A customer's payment through the
          Sweepr payment system satisfies the customer's payment obligation to
          the Cleaner to the extent of the amount collected. Voluntary tips
          belong entirely to the Cleaner; Sweepr takes no commission on tips.
        </p>
      </Section>

      <Section id="connect" title="6. Cleaner Connected Accounts">
        <p>
          Cleaners receive payouts through a Stripe Connect account and must
          complete Stripe onboarding, including identity verification. Cleaners
          must accept Stripe's connected-account terms.
        </p>
      </Section>

      <Section id="payouts" title="7. Payouts, Holds & Reserves">
        <p>
          Cleaner payouts follow the schedule shown in the app. Sweepr or the
          processor may delay, hold, or reserve payouts for risk, fraud review,
          disputes, validated damage claims, or as required by law. Fee and payout
          changes follow the{" "}
          <Link className="text-seafoam-700 underline" to="/platform-fee-policy">
            Marketplace Services Fee Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="chargebacks" title="8. Chargebacks & Refunds">
        <p>
          Refunds are handled under the{" "}
          <Link className="text-seafoam-700 underline" to="/refund-policy">
            Refund Policy
          </Link>
          . Sweepr may dispute illegitimate chargebacks and recover associated
          costs. Repeated or fraudulent chargebacks may lead to suspension.
        </p>
      </Section>

      <Section id="negative" title="9. Negative Balances">
        <p>
          If your account develops a negative balance (for example, from a refund,
          reversal, or validated claim), Sweepr may offset it against future
          payouts or seek repayment consistent with applicable law.
        </p>
      </Section>

      <Section id="kyc" title="10. Identity, KYC & Sanctions">
        <p>
          Payment services require identity verification and screening against
          sanctions and other legal requirements. Accounts may be suspended for
          payment risk or to comply with law.
        </p>
      </Section>

      <Section id="fees" title="11. Fees">
        <p>
          The Marketplace Services Fee, commissions, and processing costs are described in the{" "}
          <Link className="text-seafoam-700 underline" to="/platform-fee-policy">
            Marketplace Services Fee Policy
          </Link>
          . Tax forms and reporting are described in the{" "}
          <Link className="text-seafoam-700 underline" to="/tax-reporting">
            Tax Reporting Policy
          </Link>
          . Questions? Contact{" "}
          <a className="text-seafoam-700 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
