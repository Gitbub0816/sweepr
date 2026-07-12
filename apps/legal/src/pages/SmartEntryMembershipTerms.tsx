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

const toc = [
  { id: "overview", title: "Overview" },
  { id: "smart-entry", title: "Sweepr Smart Entry" },
  { id: "authorization", title: "Access Authorization & Consent" },
  { id: "access-controls", title: "Access Controls & Limits" },
  { id: "smart-entry-fees", title: "Smart Entry Fees" },
  { id: "membership", title: "Sweepr+ Membership" },
  { id: "benefits", title: "Sweepr+ Benefits" },
  { id: "billing", title: "Membership Billing & Cancellation" },
  { id: "liability", title: "Devices, Availability & Liability" },
  { id: "privacy", title: "Access Data & Privacy" },
  { id: "changes", title: "Modification & Termination" },
];

export function SmartEntryMembershipTerms() {
  return (
    <DocPage
      title="Smart Entry & Sweepr+ Terms"
      version="1.0.0"
      effectiveDate="TBD"
      intro="These terms govern Sweepr Smart Entry (temporary, controlled home access for your assigned cleaner) and the Sweepr+ membership. By enabling Smart Entry or subscribing to Sweepr+, you agree to these terms in addition to the Sweepr Terms of Service and Privacy Policy."
      toc={toc}
    >
      <Section id="overview" title="1. Overview">
        <p>
          Sweepr Smart Entry lets you give your assigned, verified cleaner temporary access to your
          home during a scheduled cleaning, using a customer-provided keypad code, an automatically
          generated temporary smart-lock code, a server-triggered remote unlock through a supported
          smart-lock provider, or traditional instructions such as a lockbox or front desk. Sweepr+
          is an optional paid membership that includes Smart Entry on eligible cleanings along with
          member savings and other benefits.
        </p>
      </Section>

      <Section id="smart-entry" title="2. Sweepr Smart Entry">
        <p>
          When you select Smart Entry, you authorize Sweepr to provide your assigned cleaner with
          temporary access to the lock or entry method you designate, only for a specific booking.
          Access is restricted by time, location, cleaner identity, and booking status, and is
          automatically revoked after the job. A working door code, digital key, or unlock command is
          never available merely because a cleaner is assigned to a booking.
        </p>
        <p>
          Smart Entry availability depends on your device, internet connectivity, batteries, hub, and
          smart-lock provider. Supported access methods and providers may change over time.
        </p>
      </Section>

      <Section id="authorization" title="3. Access Authorization & Consent">
        <p>
          Before Sweepr creates or uses any credential, you must explicitly authorize access for the
          specific property and lock. Your authorization records which lock is connected, the
          associated property, the access start and end times, and whether Sweepr may automatically
          generate a temporary code or lock the door. You may revoke access before entry, subject to
          applicable cancellation and service policies.
        </p>
        <p>
          For your security, if you provide a temporary keypad code, create a code that is valid only
          around your scheduled cleaning and do not share a permanent household, master, or
          alarm-disarm code, or any code you reuse for other accounts or services.
        </p>
      </Section>

      <Section id="access-controls" title="4. Access Controls & Limits">
        <p>
          Every request to reveal a code, unlock, or lock is evaluated by Sweepr's servers at the
          time of the request. Access may be granted only when the cleaner remains assigned and
          verified, is within the permitted arrival or cleaning window, is physically near your
          property with a recent, sufficiently accurate location reading, has completed check-in, has
          recently authenticated on an approved device, and has not been suspended, reassigned, or
          rate-limited. When the safest action is uncertain, Sweepr will deny access and may require
          support intervention. Unlock and access events may be recorded, and you will be notified of
          access activity.
        </p>
      </Section>

      <Section id="smart-entry-fees" title="5. Smart Entry Fees">
        <p>
          For customers who are not active Sweepr+ members, Smart Entry is offered as an optional
          add-on to an eligible cleaning for a fee shown in your quote before you confirm (currently
          $5 per eligible cleaning). Active Sweepr+ members receive Smart Entry on eligible cleanings
          at no additional charge. The fee is not charged when the lock cannot be connected, when you
          abandon setup before authorization, when Sweepr fails to create the credential before the
          cancellation cutoff, or when the booking is cancelled under a policy that provides a full
          refund. Prices and eligibility are configurable and may change.
        </p>
      </Section>

      <Section id="membership" title="6. Sweepr+ Membership">
        <p>
          Sweepr+ is a recurring paid membership available to customers with a valid Sweepr account,
          a valid payment method, and an account in good standing. Membership benefits begin only
          after your payment is confirmed by our payment processor as active or trialing, and remain
          subject to an active membership.
        </p>
      </Section>

      <Section id="benefits" title="7. Sweepr+ Benefits">
        <p>Sweepr+ includes, subject to configuration and eligibility:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Sweepr Smart Entry on eligible cleanings at no additional charge.</li>
          <li>
            A member discount on eligible cleaning service subtotals (currently 3%), subject to a
            maximum discount per calendar month (currently $15). The discount does not apply to tips,
            taxes, background-check or identity-verification charges, Smart Entry charges, damage or
            mess-condition adjustments, cancellation fees, third-party rental charges, gift cards,
            promotional-credit purchases, or other excluded charges.
          </li>
          <li>Priority access to selected newly available booking times.</li>
          <li>Priority cleaner matching when availability is limited, subject to fair-marketplace rules.</li>
          <li>One waived late-reschedule fee within a rolling period (currently every 90 days).</li>
          <li>Priority member support and faster escalation for access issues.</li>
          <li>Faster repeat booking through saved preferences.</li>
        </ul>
        <p>
          Benefits are recommendations that may be adjusted, and none guarantee cleaner availability
          or a specific response time.
        </p>
      </Section>

      <Section id="billing" title="8. Membership Billing & Cancellation">
        <p>
          Sweepr+ is billed on a recurring monthly or annual basis at the price shown at signup
          (currently $12.99 per month or $129 per year). Your membership renews automatically until
          cancelled. You may cancel renewal at any time; your membership and its benefits remain
          active through the end of the paid billing period, after which future bookings lose member
          benefits. If a renewal payment fails, your membership is marked past due and, after a grace
          period, new member discounts and new Smart Entry inclusions stop; a renewal failure will
          never interrupt physical access to your home for a cleaning already in progress. Refunds
          are handled under Sweepr's refund policy, and Sweepr may decline refunds or restrict
          membership in cases of abuse.
        </p>
      </Section>

      <Section id="liability" title="9. Devices, Availability & Liability">
        <p>
          Smart Entry depends on third-party smart-lock hardware and services that Sweepr does not
          control. Sweepr is not responsible for lock malfunctions, dead batteries, connectivity
          loss, or provider outages, though we will notify you of known issues where possible and
          offer approved fallback access options. You are responsible for maintaining your lock, its
          connectivity, and a backup access method.
        </p>
      </Section>

      <Section id="privacy" title="10. Access Data & Privacy">
        <p>
          Sweepr encrypts sensitive access data and does not store working credentials in plaintext.
          Door codes, digital keys, provider tokens, hidden-key locations, and alarm instructions are
          restricted and are not shown in ordinary account, support, analytics, or logging tools.
          Access-event records may be retained for safety, dispute-resolution, and legal obligations.
          You may disconnect your lock, revoke future access, remove saved access preferences, and
          view recent access events, as described in our Privacy Policy.
        </p>
      </Section>

      <Section id="changes" title="11. Modification & Termination">
        <p>
          Sweepr may modify, suspend, or discontinue Smart Entry or Sweepr+, or adjust their prices,
          benefits, limits, and eligibility, with notice where required. Material changes to
          recurring pricing will be disclosed before they take effect. Sweepr may disable Smart Entry
          or membership for a customer or cleaner for security, safety, or policy reasons.
        </p>
      </Section>
    </DocPage>
  );
}
