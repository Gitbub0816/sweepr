/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

// DRAFT — attorney review required before production use.
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { LEGAL_EMAIL } from "../docs";

const toc = [
  { id: "overview", title: "Overview & Eligibility" },
  { id: "badge", title: "Founder Number & Badge" },
  { id: "cleaner-perks", title: "Perks for Founding Cleaning Professionals" },
  { id: "customer-perks", title: "Perks for Founding Customers" },
  { id: "duration", title: "Duration & Good Standing" },
  { id: "revocation", title: "Revocation & Restoration" },
  { id: "changes", title: "Program Changes" },
  { id: "relationship", title: "Relationship to Other Terms" },
  { id: "contact", title: "Contact" },
];

export function FoundingMemberTerms() {
  return (
    <DocPage
      title="Founding Member Program Terms"
      version="1.0.0"
      effectiveDate="TBD"
      intro="These terms govern Sweepr's Founding Member program: a one-time, permanent recognition and set of perks for the earliest customers and cleaning professionals on the platform. By enrolling as a Founding Member, you agree to these terms in addition to the Sweepr Terms of Service (and, for cleaning professionals, the Cleaner Agreement)."
      toc={toc}
    >
      <Section id="overview" title="1. Overview & Eligibility">
        <p>
          Founding Member status is a one-time, permanent designation available to early Sweepr
          customers and cleaning professionals while an enrollment window is open. Sweepr may bound
          an enrollment window by a cutoff date, a maximum number of members, or both, and may open
          or close enrollment for customers and cleaning professionals independently.
        </p>
        <p>
          <strong>You may hold Founding Member status on only one side of the platform.</strong> A
          person who enrolls as a founding customer cannot separately enroll as a founding cleaning
          professional (or vice versa); status is tied to the person, not the account type.
        </p>
      </Section>

      <Section id="badge" title="2. Founder Number & Badge">
        <p>
          Enrollment assigns a sequential founder number, assigned in the order members enroll. Your
          founder number is permanent and is retained for record-keeping even if your status is later
          revoked (see Section 6).
        </p>
        <p>
          Founding Members choose one badge color to display with their founder number. This choice
          is <strong>one-time and permanent</strong> — once selected, a badge color cannot be
          changed.
        </p>
      </Section>

      <Section id="cleaner-perks" title="3. Perks for Founding Cleaning Professionals">
        <p>
          A Founding cleaning professional in good standing receives:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            A <strong>permanent 5% earnings bonus</strong>, applied to every payout on top of any
            tier-based multiplier already earned. On a booking where a cleaning professional would
            otherwise earn $80, a Founding cleaning professional earns $84.
          </li>
          <li>A permanent recognition badge and founder number, displayed on their profile.</li>
          <li>Recognition as a Founding Member "since" the year they enrolled.</li>
        </ul>
        <p>
          Sweepr may change the bonus percentage prospectively for future bookings (see Section 7),
          but the bonus applies automatically to every payout for as long as status remains active
          and in good standing.
        </p>
      </Section>

      <Section id="customer-perks" title="4. Perks for Founding Customers">
        <p>
          A Founding customer in good standing receives:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            A <strong>permanent 5% discount on the platform fee</strong>, applied automatically to
            every booking's total price. For example, on a $100 cleaning where the standard platform
            fee is $20 (and a non-Founding cleaning professional would earn $80), a Founding customer
            pays $95 instead of $100 — the cleaning professional's earnings are unaffected.
          </li>
          <li>A permanent recognition badge and founder number, displayed on their profile.</li>
          <li>Recognition as a Founding Member "since" the year they enrolled.</li>
        </ul>
        <p>
          <strong>This discount reduces only the platform fee portion of a booking; it never reduces
          what the assigned cleaning professional is paid.</strong> Sweepr absorbs the discount out of
          its own fee. The discount is calculated on the booking total before any separately itemized
          taxes and does not apply to tips, which are always paid to the cleaning professional in
          full. The applied amount is shown as a line item in your booking's price breakdown before
          you confirm.
        </p>
        <p>
          Sweepr may change the discount percentage prospectively for future bookings (see Section
          7), but the discount applies automatically to every booking for as long as status remains
          active and in good standing.
        </p>
      </Section>

      <Section id="duration" title="5. Duration & Good Standing">
        <p>
          Founding Member status and its perks last for the life of your account, provided your
          account remains in good standing. A temporary account suspension does not, by itself, end
          Founding Member status — perks resume automatically once a suspension is lifted. Status and
          perks end only upon an explicit revocation (Section 6) or account deletion.
        </p>
      </Section>

      <Section id="revocation" title="6. Revocation & Restoration">
        <p>
          Sweepr's Trust & Safety team may revoke Founding Member status for cause, including fraud,
          abuse of the program, repeated policy violations, or a permanent account ban. A revoked
          member's founder number is retained for audit purposes but is no longer displayed, and all
          perks (the earnings bonus or platform-fee discount, and badge display) stop immediately.
        </p>
        <p>
          A revoked member may have their status restored at Sweepr's discretion, in which case their
          original founder number and enrollment date are reinstated.
        </p>
      </Section>

      <Section id="changes" title="7. Program Changes">
        <p>
          Sweepr may modify the earnings bonus percentage, the platform-fee discount percentage,
          enrollment cutoffs, or membership caps, or close enrollment entirely, at any time and at its
          sole discretion. Any such change applies prospectively, to bookings and payouts occurring
          after the change takes effect. <strong>Sweepr will not retroactively reduce the bonus or
          discount percentage that applied to a Founding Member at the time they enrolled</strong>,
          except where status is revoked for cause under Section 6.
        </p>
        <p>
          Sweepr may also discontinue the Founding Member program for future enrollees at any time.
          Discontinuing new enrollment does not affect the status or perks of members who already
          enrolled.
        </p>
      </Section>

      <Section id="relationship" title="8. Relationship to Other Terms">
        <p>
          These terms supplement, and do not replace, the Sweepr Terms of Service, the Cleaner
          Agreement (for cleaning professionals), the Payment Terms, and the Platform Fee Policy.
          Where these terms are silent, those agreements govern. Promotions that grant Founding Member
          status are also governed by the Promotions & Coupons Terms.
        </p>
      </Section>

      <Section id="contact" title="9. Contact">
        <p>
          Questions about the Founding Member program? Contact{" "}
          <a className="text-seafoam-700 underline" href={`mailto:${LEGAL_EMAIL}`}>
            {LEGAL_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}
