// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "processor", title: "Payment Processor" },
  { id: "customer-auth", title: "Customer Payment Authorization" },
  { id: "saved", title: "Saved Payment Methods" },
  { id: "recurring", title: "Recurring Billing" },
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
          <Link className="text-seafoam-600 underline" to="/refund-policy">
            Refund Policy
          </Link>
          .
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
          <Link className="text-seafoam-600 underline" to="/subscription-terms">
            Subscription Terms
          </Link>
          .
        </p>
      </Section>

      <Section id="connect" title="5. Cleaner Connected Accounts">
        <p>
          Cleaners receive payouts through a Stripe Connect account and must
          complete Stripe onboarding, including identity verification. Cleaners
          must accept Stripe's connected-account terms.
        </p>
      </Section>

      <Section id="payouts" title="6. Payouts, Holds & Reserves">
        <p>
          Cleaner payouts follow the schedule shown in the app. Sweepr or the
          processor may delay, hold, or reserve payouts for risk, fraud review,
          disputes, validated damage claims, or as required by law. Fee and payout
          changes follow the{" "}
          <Link className="text-seafoam-600 underline" to="/platform-fee-policy">
            Platform Fee Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="chargebacks" title="7. Chargebacks & Refunds">
        <p>
          Refunds are handled under the{" "}
          <Link className="text-seafoam-600 underline" to="/refund-policy">
            Refund Policy
          </Link>
          . Sweepr may dispute illegitimate chargebacks and recover associated
          costs. Repeated or fraudulent chargebacks may lead to suspension.
        </p>
      </Section>

      <Section id="negative" title="8. Negative Balances">
        <p>
          If your account develops a negative balance (for example, from a refund,
          reversal, or validated claim), Sweepr may offset it against future
          payouts or seek repayment consistent with applicable law.
        </p>
      </Section>

      <Section id="kyc" title="9. Identity, KYC & Sanctions">
        <p>
          Payment services require identity verification and screening against
          sanctions and other legal requirements. Accounts may be suspended for
          payment risk or to comply with law.
        </p>
      </Section>

      <Section id="fees" title="10. Fees">
        <p>
          Platform fees, commissions, and processing costs are described in the{" "}
          <Link className="text-seafoam-600 underline" to="/platform-fee-policy">
            Platform Fee Policy
          </Link>
          . Tax forms and reporting are described in the{" "}
          <Link className="text-seafoam-600 underline" to="/tax-reporting">
            Tax Reporting Policy
          </Link>
          . Questions? Contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
