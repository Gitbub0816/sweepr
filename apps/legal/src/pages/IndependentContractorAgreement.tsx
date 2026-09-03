/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import {
  COMPANY_NAME,
  CONTACT_EMAIL,
  STATE_OF_INCORPORATION,
} from "../docs";

const toc = [
  { id: "scope", title: "Scope" },
  { id: "status", title: "Independent Contractor Status" },
  { id: "opportunities", title: "Service Opportunities" },
  { id: "compliance", title: "Licenses & Legal Compliance" },
  { id: "ab5", title: "California Classification (AB5 / Borello)" },
  { id: "fee", title: "Marketplace Services Fee" },
  { id: "ratecard", title: "Compensation & Opt-In to Rate Card" },
  { id: "payment-agency", title: "Payment Collection Authorization" },
  { id: "tips", title: "Tips" },
  { id: "background", title: "Background Check Consent" },
  { id: "tax", title: "Tax Responsibility" },
  { id: "insurance", title: "Insurance" },
  { id: "termination", title: "Term, Deactivation & Marketplace Access" },
  { id: "confidentiality", title: "Confidentiality" },
  { id: "hierarchy", title: "Order of Precedence" },
  { id: "governing", title: "Governing Law" },
];

export function IndependentContractorAgreement() {
  return (
    <DocPage
      title="Independent Contractor Agreement"
      intro={`This Independent Contractor Agreement ("Agreement") sets out the terms under which independent cleaning professionals provide services through the Sweepr platform operated by ${COMPANY_NAME}.`}
      toc={toc}
    >
      <Section id="scope" title="1. Scope">
        <p>
          This Agreement is between the cleaner ("Service Provider") and{" "}
          {COMPANY_NAME} ("Platform" or "Sweepr"). By creating a Cleaner account
          and accepting jobs through Sweepr, the Service Provider agrees to these
          terms.
        </p>
      </Section>

      <Section id="status" title="2. Independent Contractor Status">
        <p>
          The Service Provider is an independent contractor and not an employee
          of Sweepr. As an independent contractor, the Service Provider:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Sets their own schedule and availability;</li>
          <li>
            Uses their own tools and supplies (unless the customer chooses to
            provide them);
          </li>
          <li>May work for other platforms, agencies, or clients;</li>
          <li>
            Is responsible for their own taxes, including federal, state, and
            self-employment taxes;
          </li>
          <li>Is not entitled to employee benefits of any kind;</li>
          <li>May accept or decline any job offered through the Platform.</li>
        </ul>
      </Section>

      <Section id="opportunities" title="3. Service Opportunities">
        <p>
          Sweepr operates a marketplace that presents individual service
          opportunities to eligible Service Providers. A booking for which the
          Platform identifies the Service Provider as a candidate is a{" "}
          <strong>proposed match</strong>, not a work order or a directive to
          report to work. The Service Provider may accept or decline any
          service opportunity; if declined, the Platform may offer the
          opportunity to another eligible Service Provider.
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>No minimum number of service opportunities is guaranteed or required;</li>
          <li>The Service Provider is not required to remain continuously available;</li>
          <li>
            The Service Provider may pause availability, change their service
            area, or stop using the Platform at any time;
          </li>
          <li>
            The Service Provider may provide services through competing
            platforms and operate their own independent cleaning business
            outside Sweepr.
          </li>
        </ul>
        <p>
          A Service Provider who accepts an opportunity agrees to perform the
          accepted service. Accountability for services voluntarily accepted
          and not performed is distinct from any consequence for declining an
          opportunity that was never accepted.
        </p>
      </Section>

      <Section id="compliance" title="4. Licenses, Registrations & Legal Compliance">
        <p>
          Each Service Provider is solely responsible for identifying,
          obtaining, maintaining, and renewing all licenses, permits,
          registrations, tax accounts, insurance coverage, certifications, and
          other authorizations required for the Service Provider's independent
          business activities and for providing services in each jurisdiction
          the Service Provider selects, including any local business licenses,
          business tax registrations, or fictitious business name filings.
        </p>
        <p>
          Access to the Sweepr platform does not, by itself, establish that a
          Service Provider is legally authorized to operate an independent
          business or satisfies every requirement applicable to independent
          contractors, and approval to access the marketplace is not a
          representation by Sweepr that the Service Provider has satisfied any
          such requirement, except to the extent applicable law expressly
          requires Sweepr to verify or enforce a particular requirement.
          Sweepr does not provide legal or tax advice regarding independent
          contractor status or business compliance; Service Providers are
          responsible for obtaining their own advice. The Service Provider must
          comply with all applicable federal, state, county, and municipal
          laws.
        </p>
      </Section>

      {/*
        NOTE: Proposition 22 applies to app-based transportation and delivery
        network companies, not ordinary home-cleaning marketplaces, and should
        NOT be relied upon here. The classification analysis below is framed
        around AB5 / the Borello factors and the independent-business model.
      */}
      <Section id="ab5" title="5. California Classification (AB5 / Borello)">
        <p>
          Sweepr classifies Cleaners as independent contractors. This
          classification reflects that Service Providers operate independent
          businesses: they control how, when, and whether they perform work;
          they supply their own equipment and supplies; they set their own
          service areas and schedules; and they are free to provide services to
          other platforms and directly to their own clients.
        </p>
        <p>
          This Agreement is intended to be consistent with applicable California
          law, including Assembly Bill 5 (AB5, Labor Code § 2775 et seq.) and the
          multi-factor analysis under <em>S.G. Borello &amp; Sons, Inc. v.
          Department of Industrial Relations</em>. Nothing in this Agreement
          shall be construed to create an employment relationship. The parties
          acknowledge that worker classification is a fact-specific legal
          question.
        </p>
      </Section>

      <Section id="fee" title="6. Marketplace Services Fee">
        <p>
          Sweepr charges a Marketplace Services Fee on each completed booking.
          The Cleaner receives their agreed payout. The applicable fee and payout
          are disclosed in the Cleaner dashboard prior to acceptance of each job.
        </p>
        <p>
          The Marketplace Services Fee and commissions may change for future bookings on advance
          notice and will not be applied retroactively to reduce payment for a
          booking already accepted before the effective date, except as permitted
          under the{" "}
          <a className="text-seafoam-700 underline" href="/platform-fee-policy">
            Marketplace Services Fee Policy
          </a>
          . Payouts are processed under the{" "}
          <a className="text-seafoam-700 underline" href="/payment-terms">
            Payment Services Terms
          </a>
          .
        </p>
      </Section>

      <Section id="ratecard" title="7. Compensation & Opt-In to Rate Card">
        <p>
          Sweepr calculates the customer-facing marketplace price through its
          pricing technology and discloses the Service Provider's earnings for
          each service opportunity before acceptance. By accepting an
          opportunity, the Service Provider agrees to perform it for the
          disclosed compensation under Sweepr's published rate methodology for
          that service type. The Service Provider may decline any opportunity
          and is under no obligation to accept any particular opportunity or
          volume of opportunities. Provider compensation is earnings of the
          Service Provider's independent business and is not wages, salary, or
          payroll.
        </p>
      </Section>

      {/*
        NOTE: Limited payment collection agency is the standard marketplace
        pattern (Stripe Connect destination charges).
      */}
      <Section id="payment-agency" title="8. Payment Collection Authorization">
        <p>
          The Service Provider appoints Sweepr, acting through its payment
          processor, as the Service Provider's limited agent solely for the
          purpose of collecting amounts owed by customers for services the
          Service Provider performs through the Platform. Amounts a customer
          pays through the Sweepr payment system are treated as received by the
          Service Provider to the extent of the compensation collected on the
          Service Provider's behalf, and to that extent the customer's payment
          obligation to the Service Provider is satisfied even if Sweepr fails
          to remit the corresponding amount to the Service Provider. Sweepr's
          obligation to remit collected provider compensation is governed by
          the Payment Services Terms, including payout timing, holds,
          adjustments, refunds, and chargebacks.
        </p>
      </Section>

      <Section id="tips" title="9. Tips">
        <p>
          Voluntary customer tips belong entirely to the Service Provider.
          Sweepr does not take a Marketplace Services Fee or commission from tips.
          Third-party payment processing costs may apply as disclosed.
        </p>
      </Section>

      <Section id="background" title="10. Background Check Consent">
        <p>
          The Service Provider consents to a background check conducted by a
          third-party consumer reporting agency (Yardstik, Inc.) as a condition of
          providing services through the Platform, and to identity verification
          where required. The Service Provider authorizes Sweepr to obtain and
          review such reports in accordance with the Fair Credit Reporting Act
          (FCRA) and applicable state law.
        </p>
      </Section>

      <Section id="tax" title="11. Tax Responsibility">
        <p>
          The Service Provider is solely responsible for reporting and paying all
          applicable taxes. Sweepr will issue a Form 1099-NEC if annual earnings
          exceed $600 (or the then-current IRS threshold). Sweepr does not
          withhold taxes from payouts.
        </p>
      </Section>

      <Section id="insurance" title="12. Insurance">
        <p>
          Sweepr does not provide workers' compensation coverage to Service
          Providers, and does not sell, provide, or procure insurance for them.
          The Service Provider must obtain and maintain general liability
          insurance meeting the minimum Sweepr specifies, in their own business's
          name, as a condition of accepting jobs, along with any other coverage
          required by law or prudent for their business.
        </p>
      </Section>

      <Section id="termination" title="13. Term, Deactivation & Marketplace Access">
        <p>
          Either party may end this Agreement at any time. The Service Provider
          may stop using the Platform at any time without penalty for unaccepted
          opportunities. Sweepr may suspend or deactivate marketplace access for
          violations of these terms, the Terms of Service, fraud, theft,
          violence, harassment, discriminatory conduct, serious safety concerns,
          repeated failure to perform accepted services, falsified completion
          evidence, or platform manipulation. Where appropriate and not
          prohibited by safety or legal considerations, Sweepr will provide
          notice of the reason for deactivation and an opportunity to respond
          or request review. Deactivation is a loss of marketplace access, not
          a termination of employment.
        </p>
      </Section>

      <Section id="confidentiality" title="14. Confidentiality">
        <p>
          The Service Provider must keep confidential all customer information
          obtained through the Platform, including customer addresses, entry
          codes, and personal details, and may use such information only to
          perform the booked service. Customer addresses must not be shared,
          retained beyond the booking, or used for any other purpose.
        </p>
      </Section>

      <Section id="hierarchy" title="15. Order of Precedence">
        <p>
          The Service Provider's relationship with Sweepr is governed by, in
          descending order of precedence in the event of conflict: (1) this
          Independent Contractor Agreement; (2) the Cleaner Platform Agreement;
          (3) the incorporated platform policies (including the Payment
          Services Terms, Marketplace Services Fee Policy, Trust &amp; Safety Policy, and
          Damage Claims Policy); and (4) the Terms of Service.
        </p>
      </Section>

      <Section id="governing" title="16. Governing Law">
        <p>
          This Agreement is governed by the laws of the State of{" "}
          {STATE_OF_INCORPORATION}. Questions may be directed to{" "}
          <a className="text-seafoam-700 underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
