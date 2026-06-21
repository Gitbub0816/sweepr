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
  { id: "ab5", title: "California AB5 / Prop 22 Disclosure" },
  { id: "fee", title: "Platform Fee" },
  { id: "ratecard", title: "Opt-In to Rate Card" },
  { id: "background", title: "Background Check Consent" },
  { id: "tax", title: "Tax Responsibility" },
  { id: "insurance", title: "Insurance" },
  { id: "termination", title: "Termination" },
  { id: "confidentiality", title: "Confidentiality" },
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

      <Section id="ab5" title="3. California AB5 / Prop 22 Disclosure">
        <p>
          Sweepr classifies Cleaners as independent contractors. This
          classification is based on the fact that Service Providers operate
          independent businesses: they control how, when, and whether they
          perform work; they supply their own equipment; they are free to
          provide services to other businesses and directly to their own
          clients; and the cleaning work performed is outside Sweepr's usual
          course of business as a technology platform.
        </p>
        <p>
          This Agreement is intended to comply with applicable California law,
          including Assembly Bill 5 (AB5, Labor Code § 2775 et seq.) and the
          framework established by Proposition 22, where and to the extent
          applicable. Nothing in this Agreement shall be construed to create an
          employment relationship.
        </p>
      </Section>

      <Section id="fee" title="4. Platform Fee">
        <p>
          Sweepr charges a platform fee from each completed booking. The Cleaner
          receives their agreed payout. The applicable fee and payout are
          disclosed in the Cleaner dashboard prior to acceptance of each job.
        </p>
      </Section>

      <Section id="ratecard" title="5. Opt-In to Rate Card">
        <p>
          By accepting jobs through the Sweepr platform, the Service Provider
          agrees to Sweepr's published rate card for each service type. Sweepr
          sets customer-facing prices. The Service Provider may decline any job
          and is under no obligation to accept any particular job or volume of
          jobs.
        </p>
      </Section>

      <Section id="background" title="6. Background Check Consent">
        <p>
          The Service Provider consents to a background check conducted by a
          third-party consumer reporting agency (e.g., Checkr) as a condition of
          providing services through the Platform, and to identity verification
          where required. The Service Provider authorizes Sweepr to obtain and
          review such reports in accordance with the Fair Credit Reporting Act
          (FCRA) and applicable state law.
        </p>
      </Section>

      <Section id="tax" title="7. Tax Responsibility">
        <p>
          The Service Provider is solely responsible for reporting and paying all
          applicable taxes. Sweepr will issue a Form 1099-NEC if annual earnings
          exceed $600 (or the then-current IRS threshold). Sweepr does not
          withhold taxes from payouts.
        </p>
      </Section>

      <Section id="insurance" title="8. Insurance">
        <p>
          Sweepr does not provide workers' compensation coverage to Service
          Providers. The Service Provider is encouraged to obtain appropriate
          liability insurance and any other coverage required by law or prudent
          for their business.
        </p>
      </Section>

      <Section id="termination" title="9. Termination">
        <p>
          Either party may terminate this Agreement at any time, with or without
          cause. Sweepr may suspend or deactivate a Cleaner account for
          violations of these terms, the Terms of Service, or for conduct that
          endangers customers or other users.
        </p>
      </Section>

      <Section id="confidentiality" title="10. Confidentiality">
        <p>
          The Service Provider must keep confidential all customer information
          obtained through the Platform, including customer addresses, entry
          codes, and personal details, and may use such information only to
          perform the booked service. Customer addresses must not be shared,
          retained beyond the booking, or used for any other purpose.
        </p>
      </Section>

      <Section id="governing" title="11. Governing Law">
        <p>
          This Agreement is governed by the laws of the State of{" "}
          {STATE_OF_INCORPORATION}. Questions may be directed to{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
