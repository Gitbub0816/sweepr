import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import {
  COMPANY_NAME,
  CONTACT_EMAIL,
  LEGAL_EMAIL,
  STATE_OF_INCORPORATION,
  REGISTERED_ADDRESS,
  LEGAL_URL,
} from "../docs";

const toc = [
  { id: "definitions",     title: "1. Definitions" },
  { id: "acceptance",      title: "2. Acceptance" },
  { id: "description",     title: "3. Platform Description" },
  { id: "contractor",      title: "4. Independent Contractor Status" },
  { id: "accounts",        title: "5. Accounts & Security" },
  { id: "booking",         title: "6. Bookings & Cancellations" },
  { id: "pricing",         title: "7. Pricing & Fees" },
  { id: "payment",         title: "8. Payment Processing" },
  { id: "prohibited",      title: "9. Prohibited Conduct" },
  { id: "content",         title: "10. User Content" },
  { id: "ip",              title: "11. Intellectual Property" },
  { id: "disclaimers",     title: "12. Disclaimers" },
  { id: "liability",       title: "13. Limitation of Liability" },
  { id: "indemnification", title: "14. Indemnification" },
  { id: "termination",     title: "15. Termination" },
  { id: "disputes",        title: "16. Dispute Resolution" },
  { id: "governing",       title: "17. Governing Law" },
  { id: "general",         title: "18. General Provisions" },
  { id: "contact",         title: "19. Contact" },
];

export function TermsOfService() {
  return (
    <DocPage
      title="Terms of Service"
      intro={`PLEASE READ THESE TERMS OF SERVICE CAREFULLY. THEY CONTAIN IMPORTANT INFORMATION ABOUT YOUR RIGHTS AND OBLIGATIONS, INCLUDING A BINDING ARBITRATION CLAUSE AND CLASS ACTION WAIVER IN SECTION 16. BY USING THE PLATFORM, YOU AGREE TO THESE TERMS.`}
      toc={toc}
    >
      <Section id="definitions" title="1. Definitions">
        <p>As used in these Terms, the following capitalized terms have the meanings set forth below:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li><strong>"Agreement"</strong> means these Terms of Service, together with the Privacy Policy, and any other policies incorporated by reference.</li>
          <li><strong>"Company," "we," "us," or "our"</strong> means {COMPANY_NAME}, a California limited liability company.</li>
          <li><strong>"Cleaner"</strong> means an independent contractor who provides cleaning services through the Platform.</li>
          <li><strong>"Customer"</strong> means a person who books cleaning services through the Platform.</li>
          <li><strong>"Platform"</strong> means Sweepr's websites, web applications, mobile applications, APIs, and all related services operated by the Company.</li>
          <li><strong>"Services"</strong> means the technology platform and related services provided by the Company, excluding the cleaning services performed by Cleaners.</li>
          <li><strong>"Booking"</strong> means a confirmed engagement for cleaning services arranged through the Platform.</li>
          <li><strong>"User," "you," or "your"</strong> means any individual or entity who accesses or uses the Platform, including Customers and Cleaners.</li>
        </ul>
      </Section>

      <Section id="acceptance" title="2. Acceptance of Terms">
        <p><strong>2.1</strong> By creating an account, clicking "I agree," or otherwise accessing or using the Platform, you acknowledge that you have read, understood, and agree to be bound by this Agreement and our <a className="text-seafoam-600 underline" href={`${LEGAL_URL}/privacy`}>Privacy Policy</a>, which is incorporated herein by reference.</p>
        <p><strong>2.2</strong> If you are using the Platform on behalf of a business entity, you represent and warrant that you have authority to bind that entity to this Agreement, and "you" refers to both you individually and the entity.</p>
        <p><strong>2.3</strong> You must be at least eighteen (18) years of age to use the Platform. By using the Platform, you represent that you meet this age requirement.</p>
        <p><strong>2.4</strong> If you do not agree to any part of this Agreement, you must not use the Platform.</p>
      </Section>

      <Section id="description" title="3. Platform Description">
        <p><strong>3.1 Nature of Services.</strong> <strong>Sweepr is a technology platform that connects Customers seeking home-cleaning services with independent Cleaners. Sweepr is not a cleaning company and does not provide cleaning services.</strong></p>
        <p><strong>3.2 Scope.</strong> The Company facilitates Bookings, payment processing, scheduling, and communications between Customers and Cleaners. Cleaning services are provided solely by independent Cleaners who are not employees, agents, or representatives of the Company.</p>
        <p><strong>3.3 No Endorsement.</strong> While we conduct background checks and identity verification on Cleaners, we do not guarantee, warrant, or represent the quality, safety, or suitability of any Cleaner or the services they provide. Any decisions you make based on reviews, ratings, or other information on the Platform are made at your own risk.</p>
      </Section>

      <Section id="contractor" title="4. Independent Contractor Status">
        <p><strong>4.1</strong> Cleaners are independent contractors and not employees, agents, partners, or joint venturers of the Company. The Company does not control the means or methods by which Cleaners perform cleaning services, including tools, supplies, techniques, or timing.</p>
        <p><strong>4.2</strong> Nothing in this Agreement creates an employment, agency, partnership, or fiduciary relationship between the Company and any Cleaner or Customer.</p>
        <p><strong>4.3 California Residents.</strong> Sweepr classifies Cleaners as independent contractors consistent with applicable California law, including Assembly Bill 5 (AB5) and the Borello multi-factor analysis. Cleaners set their own schedules, supply their own equipment, are free to accept or decline any job, and may work for other platforms or directly for their own clients. See the <a className="text-seafoam-600 underline" href="/contractor-agreement">Independent Contractor Agreement</a> and <a className="text-seafoam-600 underline" href="/cleaner-agreement">Cleaner Platform Agreement</a>.</p>
      </Section>

      <Section id="accounts" title="5. Accounts and Security">
        <p><strong>5.1</strong> Account creation and authentication are managed through our identity provider. You agree to provide accurate, current, and complete information during registration and to update such information as necessary.</p>
        <p><strong>5.2</strong> You are solely responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.</p>
        <p><strong>5.3</strong> You agree to notify us immediately at <a className="text-seafoam-600 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> of any unauthorized use of your account or any other security breach.</p>
        <p><strong>5.4</strong> We will not be liable for any loss or damage arising from your failure to maintain the security of your account.</p>
      </Section>

      <Section id="booking" title="6. Bookings and Cancellations">
        <p><strong>6.1</strong> When you submit a Booking request, you are making an offer to engage a Cleaner. A Booking is confirmed when a Cleaner accepts your request and payment is authorized.</p>
        <p><strong>6.2</strong> Cancellation and refund rights are governed exclusively by our <a className="text-seafoam-600 underline" href={`${LEGAL_URL}/refund-policy`}>Refund Policy</a>, which is incorporated into this Agreement.</p>
        <p><strong>6.3</strong> The Company reserves the right to cancel a Booking at any time if a Cleaner becomes unavailable, if we determine that a Booking poses a safety risk, or for any other legitimate operational reason. In such cases, you will receive a full refund.</p>
      </Section>

      <Section id="pricing" title="7. Pricing and Fees">
        <p><strong>7.1 Transparent Pricing.</strong> <strong>All prices displayed on the Platform are final and all-inclusive. There are no hidden fees.</strong> The price shown at checkout is the total amount you will be charged, including the service fee, supply fee, and any applicable taxes.</p>
        <p><strong>7.2</strong> Sweepr sets all pricing displayed on the Platform. Cleaners do not negotiate or adjust prices directly with Customers.</p>
        <p><strong>7.3</strong> Subscription plans are billed at the per-visit price displayed at enrollment for the selected cadence (e.g., weekly, biweekly). Prices are subject to change upon thirty (30) days' written notice.</p>
        <p><strong>7.4</strong> The Company reserves the right to modify pricing and fees prospectively. Changes will not affect Bookings that have already been confirmed, and changes to Cleaner payout-affecting fees will not reduce payment for bookings already accepted by a Cleaner before the effective date, except as permitted under the <a className="text-seafoam-600 underline" href="/platform-fee-policy">Platform Fee Policy</a>. Material fee changes are provided with advance notice as described in the Platform Fee Policy and the <a className="text-seafoam-600 underline" href="/legal-updates">Legal Updates Policy</a>.</p>
      </Section>

      <Section id="payment" title="8. Payment Processing">
        <p><strong>8.1</strong> Payment processing services are provided by Stripe, Inc. ("Stripe") and are subject to the <a className="text-seafoam-600 underline" href="https://stripe.com/legal/ssa" target="_blank" rel="noreferrer">Stripe Services Agreement</a>. By using the Platform, you authorize the Company and Stripe to charge your designated payment method for all confirmed Bookings.</p>
        <p><strong>8.2</strong> The Company does not store full payment card numbers. Payment information is tokenized and stored by Stripe in accordance with PCI-DSS standards.</p>
        <p><strong>8.3</strong> By saving a payment method to your account, you authorize the Company to charge that method for future Bookings without additional authorization, unless you remove it from your account.</p>
        <p><strong>8.4</strong> All payments are final when a Booking is completed. Chargebacks initiated outside the Platform's refund process may result in suspension of your account.</p>
      </Section>

      <Section id="prohibited" title="9. Prohibited Conduct">
        <p><strong>9.1</strong> You agree not to use the Platform to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Violate any applicable law, regulation, or third-party right;</li>
          <li>Circumvent the Platform to arrange or pay for services directly with a Cleaner you were introduced to through Sweepr, whether during or after your use of the Platform;</li>
          <li>Harass, threaten, intimidate, or discriminate against any Cleaner, Customer, or Company employee;</li>
          <li>Submit false, misleading, or fraudulent information, including fraudulent reviews;</li>
          <li>Interfere with, disrupt, or attempt to gain unauthorized access to the Platform or its underlying systems;</li>
          <li>Scrape, crawl, or use automated tools to extract data from the Platform without written authorization;</li>
          <li>Use the Platform to transmit any malicious code, spam, or unsolicited communications.</li>
        </ul>
        <p><strong>9.2</strong> Violation of this Section may result in immediate termination of your account and may expose you to legal liability.</p>
      </Section>

      <Section id="content" title="10. User Content">
        <p><strong>10.1</strong> You may submit reviews, ratings, photos, and other content ("User Content") to the Platform. You retain ownership of your User Content, but you grant the Company a worldwide, perpetual, royalty-free, sublicensable license to use, display, reproduce, modify, and distribute such content in connection with operating and promoting the Platform.</p>
        <p><strong>10.2</strong> User Content must be honest, based on genuine experience, and must not violate the rights of any third party. The Company may remove any User Content that violates this Agreement or that we determine, in our sole discretion, is harmful, offensive, or otherwise inappropriate.</p>
        <p><strong>10.3</strong> You represent and warrant that your User Content does not infringe any intellectual property right, violate any privacy right, or otherwise violate applicable law.</p>
      </Section>

      <Section id="ip" title="11. Intellectual Property">
        <p><strong>11.1</strong> The Platform and all content, software, designs, trademarks, logos, and other materials made available by the Company (excluding User Content) are the exclusive property of {COMPANY_NAME} and its licensors and are protected by applicable intellectual property laws.</p>
        <p><strong>11.2</strong> Subject to your compliance with this Agreement, the Company grants you a limited, non-exclusive, non-transferable, revocable license to access and use the Platform for its intended purposes.</p>
        <p><strong>11.3</strong> You may not copy, modify, distribute, sell, sublicense, or create derivative works from any portion of the Platform without the Company's prior written consent.</p>
      </Section>

      <Section id="disclaimers" title="12. Disclaimers">
        <p>THE PLATFORM IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. THE COMPANY DOES NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS.</p>
        <p>THE COMPANY MAKES NO WARRANTY REGARDING THE QUALITY, SAFETY, RELIABILITY, TIMELINESS, OR LEGALITY OF SERVICES PROVIDED BY CLEANERS. CUSTOMERS ENGAGE CLEANERS AT THEIR OWN RISK.</p>
      </Section>

      <Section id="liability" title="13. Limitation of Liability">
        <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE COMPANY, ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES ARISING OUT OF OR RELATING TO THIS AGREEMENT OR YOUR USE OF THE PLATFORM, EVEN IF THE COMPANY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
        <p>THE COMPANY'S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATING TO THIS AGREEMENT SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID TO THE COMPANY IN THE SIX (6) CALENDAR MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE HUNDRED DOLLARS ($100.00).</p>
        <p>Some jurisdictions do not allow the exclusion of certain warranties or the limitation of liability for certain types of damages, so some of the above limitations may not apply to you.</p>
      </Section>

      <Section id="indemnification" title="14. Indemnification">
        <p><strong>14.1</strong> You agree to defend, indemnify, and hold harmless {COMPANY_NAME}, its affiliates, officers, directors, employees, agents, and licensors from and against any claims, liabilities, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or in connection with: (a) your use of the Platform; (b) your violation of this Agreement; (c) your violation of any applicable law or the rights of any third party; or (d) any User Content you submit.</p>
        <p><strong>14.2</strong> The Company reserves the right, at its own expense, to assume exclusive defense and control of any matter subject to indemnification by you, in which case you agree to cooperate fully.</p>
      </Section>

      <Section id="termination" title="15. Termination">
        <p><strong>15.1</strong> You may terminate your account at any time by contacting us at <a className="text-seafoam-600 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
        <p><strong>15.2</strong> The Company may suspend or terminate your account, at its sole discretion, immediately and without notice, if you breach any provision of this Agreement, engage in conduct that we determine poses a risk to any user or the Platform, or for any other legitimate business reason.</p>
        <p><strong>15.3</strong> Upon termination, your right to use the Platform ceases immediately. Sections 10, 11, 12, 13, 14, 16, and 17 shall survive termination.</p>
      </Section>

      <Section id="disputes" title="16. Dispute Resolution; Arbitration Agreement; Class Action Waiver">
        <p><strong>PLEASE READ THIS SECTION CAREFULLY. IT AFFECTS YOUR RIGHTS AND CONTAINS A BINDING ARBITRATION CLAUSE AND CLASS ACTION WAIVER.</strong></p>
        <p><strong>16.1 Informal Resolution.</strong> Before initiating formal proceedings, you agree to contact us at <a className="text-seafoam-600 underline" href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a> and provide a written description of the dispute and the relief sought. The parties will attempt to resolve the dispute informally for at least thirty (30) days before initiating arbitration.</p>
        <p><strong>16.2 Binding Arbitration.</strong> If informal resolution fails, any dispute, claim, or controversy arising out of or relating to this Agreement or the Platform shall be resolved by binding individual arbitration administered by JAMS in {STATE_OF_INCORPORATION}, under JAMS's then-current rules. The arbitrator's decision is final and binding and may be entered as a judgment in any court of competent jurisdiction.</p>
        <p><strong>16.3 Class Action Waiver.</strong> YOU AND THE COMPANY EACH WAIVE THE RIGHT TO A TRIAL BY JURY AND THE RIGHT TO PARTICIPATE IN A CLASS ACTION, CLASS ARBITRATION, OR ANY OTHER REPRESENTATIVE PROCEEDING.</p>
        <p><strong>16.4 Exceptions.</strong> Either party may seek emergency injunctive or other equitable relief from a court of competent jurisdiction. Claims for individual relief arising under consumer protection statutes may be excluded from arbitration where required by applicable law.</p>
        <p><strong>16.5</strong> See our full <a className="text-seafoam-600 underline" href={`${LEGAL_URL}/dispute-resolution`}>Dispute Resolution Policy</a> for complete procedures.</p>
      </Section>

      <Section id="governing" title="17. Governing Law">
        <p><strong>17.1</strong> This Agreement is governed by and construed in accordance with the laws of the State of {STATE_OF_INCORPORATION}, without regard to its conflict-of-law provisions, except that Section 16 (arbitration) is governed by the Federal Arbitration Act, 9 U.S.C. § 1 et seq.</p>
        <p><strong>17.2</strong> For any claims not subject to arbitration, you consent to exclusive jurisdiction and venue in the state and federal courts located in {STATE_OF_INCORPORATION}.</p>
      </Section>

      <Section id="general" title="18. General Provisions">
        <p><strong>18.1 Entire Agreement.</strong> This Agreement constitutes the entire agreement between you and the Company with respect to the Platform and supersedes all prior agreements.</p>
        <p><strong>18.2 Modifications.</strong> We may modify this Agreement at any time by posting the revised version on the Platform with an updated "Last Updated" date. Material changes will be communicated by email or prominent notice on the Platform at least fourteen (14) days before taking effect. Your continued use after the effective date constitutes acceptance of the revised Agreement.</p>
        <p><strong>18.3 Severability.</strong> If any provision of this Agreement is held invalid or unenforceable, the remaining provisions shall continue in full force and effect, and the invalid provision shall be modified to the minimum extent necessary to make it enforceable.</p>
        <p><strong>18.4 Waiver.</strong> The Company's failure to enforce any right or provision of this Agreement shall not be deemed a waiver of such right or provision.</p>
        <p><strong>18.5 Assignment.</strong> You may not assign or transfer your rights or obligations under this Agreement without our prior written consent. The Company may freely assign this Agreement in connection with a merger, acquisition, or sale of assets.</p>
        <p><strong>18.6 Force Majeure.</strong> Neither party shall be liable for any failure or delay in performance due to causes beyond its reasonable control.</p>
      </Section>

      <Section id="contact" title="19. Contact Information">
        <p>
          Questions, notices, and requests regarding this Agreement should be directed to:
        </p>
        <address className="not-italic mt-3 space-y-1 text-sm text-slate-700">
          <p><strong>{COMPANY_NAME}</strong></p>
          <p>{REGISTERED_ADDRESS}</p>
          <p>Email: <a className="text-seafoam-600 underline" href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a></p>
        </address>
      </Section>
    </DocPage>
  );
}
