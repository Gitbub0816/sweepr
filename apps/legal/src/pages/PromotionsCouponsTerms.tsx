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
  { id: "definitions", title: "Definitions" },
  { id: "eligibility", title: "Eligibility & Account Requirement" },
  { id: "validity", title: "Validity Period" },
  { id: "application", title: "Automatic Application" },
  { id: "limits", title: "Limits, Stacking & Transfer" },
  { id: "flash", title: "Time-Limited (Flash) Offers" },
  { id: "milestones", title: "Milestone & Themed Rewards" },
  { id: "founding", title: "Founding Member Offers" },
  { id: "abuse", title: "Fraud & Abuse" },
  { id: "changes", title: "Modification & Termination" },
];

export function PromotionsCouponsTerms() {
  return (
    <DocPage
      title="Promotions & Coupons Terms"
      version="1.0.0"
      effectiveDate="TBD"
      intro="These terms govern promotional offers displayed on Sweepr properties and the coupons they grant. By claiming a promotion or redeeming a coupon, you agree to these terms in addition to the Sweepr Terms of Service."
      toc={toc}
    >
      <Section id="overview" title="1. Overview">
        <p>
          Sweepr may, at its discretion, run promotional campaigns ("Promotions") on its websites,
          applications, and marketing channels. Some Promotions grant a coupon ("Coupon"), a
          one-time or limited-use credit toward a future booking, such as a percentage discount, a
          fixed amount off, or a complimentary add-on service.
        </p>
      </Section>

      <Section id="definitions" title="2. Definitions">
        <p>
          A "Promotion" is the customer-facing offer (a popup, banner, embedded widget, or shared
          link). A "Coupon" is the benefit granted when a Promotion's conditions are met. Coupons
          have no cash value, are not gift cards or stored value, and cannot be exchanged for cash.
        </p>
      </Section>

      <Section id="eligibility" title="3. Eligibility & Account Requirement">
        <p>
          <strong>A Sweepr account is required to claim and hold a Coupon.</strong> If you claim a
          Promotion without being signed in, the Coupon is reserved against the email address you
          provide and becomes active only when you create (or sign in to) a Sweepr account using
          that same email address. Coupons reserved to an email that never creates an account are
          never activated and lapse at the end of the validity period.
        </p>
        <p>
          Sweepr may limit any Promotion to specific audiences (for example, new customers, existing
          customers, or cleaning professionals) and may cap the total number of claims.
        </p>
      </Section>

      <Section id="validity" title="4. Validity Period">
        <p>
          <strong>Coupons are valid for a maximum of 180 days</strong> from the date of issue,
          unless the specific Promotion states a shorter window. The expiration date is shown with
          the Coupon in your account. Expired Coupons are void and are not reissued, except where
          required by law.
        </p>
      </Section>

      <Section id="application" title="5. Automatic Application">
        <p>
          Coupons apply automatically: when you create a qualifying booking, the most valuable
          eligible Coupon on your account is applied to that booking without any code entry. A
          Coupon may carry qualifying conditions (for example, a minimum booking total); Coupons
          whose conditions are not met are not applied and remain available. One Coupon applies per
          booking. The applied discount appears in your booking's price breakdown.
        </p>
      </Section>

      <Section id="limits" title="6. Limits, Stacking & Transfer">
        <p>
          Unless a Promotion states otherwise, Coupons are single-use, limited to one per person per
          Promotion, cannot be combined with other Coupons on the same booking, and are
          non-transferable. Coupons may not be sold, bartered, or published. Discounts apply to
          service charges only and do not reduce taxes, tips, or fees required by law.
        </p>
      </Section>

      <Section id="flash" title="7. Time-Limited (Flash) Offers">
        <p>
          Some Promotions grant Coupons valid for a short stated window (for example, "book within
          15 minutes"). The countdown begins when the offer is claimed, and the Coupon expires
          automatically at the end of the stated window regardless of the general 180-day maximum.
        </p>
      </Section>

      <Section id="milestones" title="8. Milestone & Themed Rewards">
        <p>
          Sweepr may issue Coupons to celebrate platform or account milestones (for example, the
          100th customer or an account anniversary) or seasonal events. Milestone and themed Coupons
          are issued at Sweepr's sole discretion, are not earned entitlements, and are governed by
          these same terms, including the validity period in Section 4.
        </p>
      </Section>

      <Section id="founding" title="9. Founding Member Offers">
        <p>
          Promotions that grant Founding Member status are additionally governed by the Founding
          Member Program terms. Founding Member status can be claimed once per person, on one
          account type (customer or cleaning professional), and is subject to the program's good
          standing requirements.
        </p>
      </Section>

      <Section id="abuse" title="10. Fraud & Abuse">
        <p>
          Sweepr may revoke Coupons, reverse applied discounts, and suspend accounts where it
          reasonably believes a Promotion was claimed or redeemed through fraud, automation,
          multiple accounts, self-dealing, or other abuse. Coupons revoked for abuse are not
          compensated.
        </p>
      </Section>

      <Section id="changes" title="11. Modification & Termination">
        <p>
          Sweepr may modify, pause, or end any Promotion at any time. Coupons already issued remain
          governed by the terms in effect when they were issued, except where a change is required
          by law. If any provision of these terms is found unenforceable, the remainder remains in
          effect.
        </p>
      </Section>
    </DocPage>
  );
}
