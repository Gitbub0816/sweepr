import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import {
  COMPANY_NAME,
  CONTACT_EMAIL,
  STATE_OF_INCORPORATION,
} from "../docs";

const toc = [
  { id: "acceptance", title: "Acceptance of Terms" },
  { id: "description", title: "Description of Service" },
  { id: "contractor", title: "Independent Contractor Relationship" },
  { id: "accounts", title: "User Accounts" },
  { id: "booking", title: "Booking & Cancellation" },
  { id: "pricing", title: "Pricing" },
  { id: "payment", title: "Payment Processing" },
  { id: "prohibited", title: "Prohibited Uses" },
  { id: "reviews", title: "Content & Reviews" },
  { id: "ip", title: "Intellectual Property" },
  { id: "disclaimers", title: "Disclaimers & Liability" },
  { id: "indemnification", title: "Indemnification" },
  { id: "disputes", title: "Dispute Resolution" },
  { id: "governing", title: "Governing Law" },
  { id: "changes", title: "Changes to Terms" },
  { id: "contact", title: "Contact" },
];

export function TermsOfService() {
  return (
    <DocPage
      title="Terms of Service"
      intro={`These Terms of Service ("Terms") govern your access to and use of the Sweepr platform operated by ${COMPANY_NAME} ("Sweepr," "we," "us," or "our"). Please read them carefully.`}
      toc={toc}
    >
      <Section id="acceptance" title="1. Acceptance of Terms">
        <p>
          By accessing or using the Sweepr website, mobile applications, or
          services (collectively, the "Platform"), you agree to be bound by
          these Terms and our Privacy Policy. If you do not agree, you may not
          use the Platform. You must be at least 18 years old to use Sweepr.
        </p>
      </Section>

      <Section id="description" title="2. Description of Service">
        <p>
          <strong>
            Sweepr is a technology platform that connects customers seeking
            home-cleaning services with independent cleaning professionals
            ("Cleaners"). Sweepr is a booking platform, not a cleaning company.
          </strong>{" "}
          We do not employ Cleaners, do not provide cleaning services directly,
          and do not supervise or control the performance of cleaning services.
        </p>
        <p>
          Sweepr facilitates bookings, payment processing, scheduling, and
          communications between customers and Cleaners. The cleaning services
          themselves are provided solely by independent Cleaners.
        </p>
      </Section>

      <Section
        id="contractor"
        title="3. Independent Contractor Relationship"
      >
        <p>
          Cleaners are independent contractors and are not employees, agents,
          partners, or joint venturers of Sweepr. Sweepr does not control the
          means or methods by which Cleaners perform cleaning services,
          including the tools, supplies, techniques, or sequence of work used.
        </p>
        <p>
          Customers contract directly with Cleaners through the Platform for
          cleaning services. Sweepr's role is limited to operating the Platform
          that enables those bookings. Nothing in these Terms creates an
          employment, agency, or fiduciary relationship between Sweepr and any
          Cleaner or customer.
        </p>
        <p>
          For California residents: Sweepr classifies Cleaners as independent
          contractors. This classification reflects that Cleaners set their own
          schedules and availability, supply their own equipment, are free to
          accept or decline any job, and may provide services through other
          platforms or directly to their own clients. This classification is
          intended to comply with applicable California law, including
          Assembly Bill 5 (AB5) and Proposition 22 frameworks where applicable.
        </p>
      </Section>

      <Section id="accounts" title="4. User Accounts">
        <p>
          Account creation and authentication are managed through our identity
          provider, Clerk. You are responsible for maintaining the
          confidentiality of your credentials and for all activity under your
          account. Notify us immediately of any unauthorized use.
        </p>
      </Section>

      <Section id="booking" title="5. Booking and Cancellation Policy">
        <p>
          When you book a cleaning, you are making an offer to engage a Cleaner
          through the Platform. Bookings are confirmed once a Cleaner accepts.
          Cancellations and refunds are governed by our{" "}
          <a className="text-seafoam-600 underline" href="/refund-policy">
            Refund Policy
          </a>
          .
        </p>
      </Section>

      <Section id="pricing" title="6. Pricing">
        <p>
          <strong>
            All prices displayed are final and inclusive. Sweepr does not charge
            hidden fees.
          </strong>{" "}
          The price you see at checkout is the total price for your cleaning,
          including supplies, service, and applicable taxes. Sweepr sets all
          prices. Recurring subscriptions are billed at the displayed
          per-visit price for the selected cadence.
        </p>
      </Section>

      <Section id="payment" title="7. Payment Processing">
        <p>
          Payments are processed by Stripe, Inc. By providing payment
          information, you authorize Sweepr and Stripe to charge your selected
          payment method for the total booking or subscription amount. Sweepr
          does not store full card numbers.
        </p>
      </Section>

      <Section id="prohibited" title="8. Prohibited Uses">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Use the Platform for any unlawful purpose;</li>
          <li>
            Circumvent Sweepr to arrange or pay for services off-platform with a
            Cleaner introduced through Sweepr;
          </li>
          <li>Harass, threaten, or discriminate against any user or Cleaner;</li>
          <li>Submit false, misleading, or fraudulent information;</li>
          <li>
            Interfere with, disrupt, or attempt to gain unauthorized access to
            the Platform.
          </li>
        </ul>
      </Section>

      <Section id="reviews" title="9. Content and Reviews">
        <p>
          You may submit reviews and other content. You grant Sweepr a
          worldwide, royalty-free license to use, display, and distribute such
          content in connection with the Platform. Reviews must be honest and
          based on genuine experiences. We may remove content that violates
          these Terms.
        </p>
      </Section>

      <Section id="ip" title="10. Intellectual Property">
        <p>
          The Platform, including its software, design, logos, and content
          (excluding user content), is owned by {COMPANY_NAME} and protected by
          intellectual property laws. You may not copy, modify, or create
          derivative works without our written permission.
        </p>
      </Section>

      <Section id="disclaimers" title="11. Disclaimers and Limitation of Liability">
        <p>
          THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES
          OF ANY KIND, EXPRESS OR IMPLIED. SWEEPR DOES NOT WARRANT THE QUALITY,
          SAFETY, OR LEGALITY OF SERVICES PROVIDED BY CLEANERS.
        </p>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, SWEEPR'S TOTAL LIABILITY
          ARISING OUT OF OR RELATING TO THESE TERMS OR THE PLATFORM SHALL NOT
          EXCEED THE AMOUNTS YOU PAID TO SWEEPR IN THE SIX (6) MONTHS PRECEDING
          THE CLAIM. SWEEPR SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL,
          SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.
        </p>
      </Section>

      <Section id="indemnification" title="12. Indemnification">
        <p>
          You agree to indemnify and hold harmless {COMPANY_NAME}, its officers,
          directors, employees, and agents from any claims, damages, or expenses
          (including reasonable attorneys' fees) arising from your use of the
          Platform or violation of these Terms.
        </p>
      </Section>

      <Section id="disputes" title="13. Dispute Resolution">
        <p>
          Most disputes can be resolved informally by contacting support. Any
          dispute that cannot be resolved informally shall be settled by binding
          arbitration administered by JAMS in California, in accordance with our{" "}
          <a className="text-seafoam-600 underline" href="/dispute-resolution">
            Dispute Resolution policy
          </a>
          . You and Sweepr waive the right to a jury trial and to participate in
          a class action.
        </p>
      </Section>

      <Section id="governing" title="14. Governing Law">
        <p>
          These Terms are governed by the laws of the State of{" "}
          {STATE_OF_INCORPORATION}, without regard to conflict-of-law
          principles, except that arbitration is governed by the Federal
          Arbitration Act.
        </p>
      </Section>

      <Section id="changes" title="15. Changes to Terms">
        <p>
          We may update these Terms from time to time. Material changes will be
          posted here with an updated "Last updated" date. Continued use of the
          Platform after changes constitutes acceptance.
        </p>
      </Section>

      <Section id="contact" title="16. Contact Information">
        <p>
          Questions about these Terms? Contact us at{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
