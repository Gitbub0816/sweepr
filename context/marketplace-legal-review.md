# Sweepr Marketplace Legal & Operational Structure Review

> Copyright © 2026–Present ClearKey Solutions, LLC. Internal Use Only.
> Prepared 2026-07-21. DRAFT — attorney review required before reliance.

## PART 1 — Current-state analysis

**Who sells the service.** The customer books through Sweepr (app.getsweepr.com),
sees one Sweepr price, authorizes one Sweepr charge (manual-capture Stripe
PaymentIntent), and receives one Sweepr receipt. ClearKey Solutions, LLC is the
Stripe account holder and therefore the **merchant of record** today.

**Who provides the service.** The Customer Agreement (§1–2) already states the
cleaning is performed by an independent Cleaner who is "not a cleaning company"
employee of Sweepr, and that the customer enters "a separate service
relationship" with the Cleaner. The Independent Contractor Agreement (ICA) and
Cleaner Platform Agreement (CPA) both establish independent-contractor status,
right to decline any job, no exclusivity, own tools/supplies, own taxes.

**Payment flow.** Customer → Stripe PI (manual capture, one per booking) →
capture after service → Stripe Connect transfer of the cleaner's earnings →
platform fee retained by Sweepr. Tips are separate immediate-capture PIs, 100%
to the cleaner, no platform fee (hard convention #4). This already matches the
facilitated-collection marketplace pattern, but **no agreement documents the
"limited payment collection agent" concept**, and nothing states that customer
payment through Sweepr discharges the customer's payment obligation to the
provider.

**Matching.** `lib/matching.ts` + `lib/assignment.ts`: a booking generates a
scored candidate list; the top candidate receives a **service offer** via
`assignment_queue` with accept/decline; declined offers re-route to the next
candidate. This is offer-based marketplace matching, not dispatch. Customers do
not pick the provider; providers do not bid.

**Where it resembles a marketplace already:** offer/accept/decline flow, no
minimum jobs, no exclusivity, provider-set availability + service area +
radius, provider supplies own equipment, Stripe Connect payouts, 1099-NEC tax
reporting, deactivation (not "firing") vocabulary throughout, background checks
framed as eligibility.

**Where it resembles a cleaning company:** (a) acceptance-rate ranking
penalties for declining offers (see Part 3, item 1); (b) scattered "assigned
cleaner" copy in customer/cleaner UI; (c) "Sweepr Pro" branding of providers in
two agreements (implies a Sweepr workforce — also violates the brand ban);
(d) mandatory base training modules gating activation; (e) no contractual
licensing/compliance clause making providers responsible for their own business
licenses/permits/registrations.

## PART 2 — Target architecture

```
Customer ──(Customer Agreement / ToS)── Sweepr marketplace (ClearKey Solutions, LLC)
Customer ──(service transaction, facilitated by Sweepr)── Independent Service Provider
Provider ──(ICA + CPA + Payment Services Terms)── Sweepr marketplace

Customer payment ─► Stripe (Sweepr = merchant of record, platform charge)
                        ├─► Provider earnings (Stripe Connect transfer;
                        │    Sweepr acts as limited payment collection agent)
                        └─► Sweepr platform fee (Sweepr revenue)
Tips ─► separate PI ─► 100% provider, no platform fee
```

- Sweepr earns its platform fee when the service transaction completes (capture).
- Provider funds become payable per the payout schedule after completion,
  subject to holds for fraud/disputes/validated damage claims.
- Refunds/chargebacks: Sweepr decides allocation per Refund/Damage policies —
  absorbed by Sweepr, offset against provider amounts where contractually and
  legally permitted, or covered by insurance.
- Merchant of record: ClearKey Solutions, LLC (destination-charge style).
  **Attorney/finance review:** whether to keep destination charges (Sweepr =
  MoR) or move to direct charges (provider = MoR). Destination charges are the
  common pattern (DoorDash/Instacart-style) and preserve the single-brand
  checkout; kept as the working assumption.

**Pricing structure chosen: Model A/C hybrid (already implemented).** Sweepr's
pricing engine sets the customer-facing price; providers see their exact
earnings for each opportunity **before accepting** and accept per-opportunity
(ICA §5 "Opt-In to Rate Card"). No redesign required; language tightened so
acceptance of a disclosed payout — not platform command — is the legal basis.

## PART 3 — Gap analysis

| # | Existing structure | Problem | Target structure | Required change | Priority |
|---|---|---|---|---|---|
| 1 | Declines beyond 1 free/day dent an "acceptance rate" that lowers matching odds (`matching.ts`, `assignment.ts`, `matchingConfig.ts`) | Penalizing refusal of never-accepted work is employer-style control; brief flags this exact policy | Rank on post-acceptance reliability (completion rate, cancellations-after-accept, ratings); use availability/pause/service-area controls to manage supply | **Product change — decision required** (see Part 5). Not changed in code in this pass | **Critical** |
| 2 | "Sweepr Pro" used as provider label in Customer Agreement + CPA | Implies Sweepr-branded workforce; violates brand rule | "Cleaner" / "Service Provider" only | Legal doc wording (done) | Critical |
| 3 | No limited-payment-collection-agent clause; customer's payment discharge not stated | Payment architecture undocumented; provider could in theory pursue customer | Provider appoints Sweepr/Stripe as limited payment collection agent; customer payment through Sweepr discharges obligation to provider | ICA + Payment Services Terms + Customer Agreement (done, attorney review) | Critical |
| 4 | No provider licensing/compliance clause | Providers' independent-business duties (licenses, permits, registrations, tax accounts) unallocated | Comprehensive compliance clause + "platform access ≠ legal authorization" statement | ICA (done) | Significant |
| 5 | "assigned cleaner" copy in customer/cleaner UI strings | Dispatch connotation | "matched" vocabulary | i18n en strings (done); other 9 locales need retranslation | Significant |
| 6 | Tips 100%-to-provider is code behavior but not contractual | Should be an express term | "Tips belong entirely to the Service Provider; Sweepr takes no commission on tips" | ICA (done) | Significant |
| 7 | ICA §9 titled "Termination" with at-will framing only | Employment overtone; no notice/appeal concept | "Deactivation & Marketplace Access" with review/appeal reference | ICA (done) | Minor |
| 8 | Mandatory base training modules gate activation | Employer-style training risk if content controls *how* to clean | Frame as safety/marketplace-standards certification; audit module content for method-micromanagement | Product/content audit — decision required | Significant |
| 9 | No express document hierarchy | Conflict-resolution order unclear | Precedence clause | ICA (done: ICA > CPA > policies for provider relationship) | Minor |

## PART 4 — Legal document plan

- **Remain as-is:** ToS, Privacy, Refund, Damage Claims, Service Scope,
  Trust & Safety, Background-check trio, Platform Fee, Tax Reporting, SMS,
  E-Sign, Dispute Resolution, Community Guidelines (already marketplace-consistent).
- **Rewritten this pass:** ICA (expanded into the primary provider agreement:
  compliance, payment agency, tips, deactivation, hierarchy, CA risk note),
  Customer Agreement (§1 wording, payment-discharge, "matched"), CPA ("Sweepr
  Pro" removal, opportunity vocabulary), Payment Services Terms (collection-agent
  section, tips, earnings allocation).
- **Create later (attorney-led):** state-specific addenda; provider privacy
  notice if provider data practices diverge from the main Privacy Policy.
- **Hierarchy (provider):** ICA controls > CPA > incorporated policies.
  **Hierarchy (customer):** ToS > Customer Agreement > incorporated policies.

## PART 5 — Operational changes required (decisions, not yet made)

1. **Decline penalties (Critical).** Recommend: remove the acceptance-rate
   ranking factor entirely; replace with (a) completion-after-acceptance
   reliability score, (b) an "availability pause" control, (c) offer-expiry
   no-response handling that simply re-routes without penalty. The current 1
   free decline/day design is *better* than most (free declines never dent the
   rate) but the residual penalty on declining un-accepted work is the single
   largest classification exposure in the product. Owner decision + small
   engine change when approved.
2. **Training audit (Significant).** Review `training_modules` content:
   keep safety, legal-compliance, app-usage, and scope-definition content;
   remove/soften any module dictating methods for ordinary tasks. Consider
   renaming surface copy to "Marketplace Orientation / Safety Certification".
3. **Other locales.** The en.json "matched" wording needs propagation to the 9
   other cleaner-app locales.

## CALIFORNIA CLASSIFICATION RISK — ATTORNEY REVIEW REQUIRED

1. **AB5 ABC test.** Residential cleaning does not enjoy Prop 22 (transportation
   /delivery only — already correctly noted in the ICA). Prong B ("outside the
   usual course of the hiring entity's business") is the hard prong for any
   cleaning marketplace: counsel must assess whether Sweepr is a technology
   platform or a cleaning company, and whether the **referral-agency exemption
   (Lab. Code § 2777)** is available — it covers "house cleaning" expressly but
   has ~11 conditions (provider sets own rates *or* negotiates, free from
   control, provides own tools, business license where required, etc.).
   **Sweepr-set pricing and the decline penalty are the two conditions most in
   tension with § 2777.** This is the central legal question of the whole
   structure.
2. **Decline penalty** (Part 5.1) — direct control evidence under Borello/ABC.
3. **Mandatory training** (Part 5.2) — control evidence if it teaches methods.
4. **Sweepr-set pricing** — § 2777(a)(6) expects the provider to set or
   negotiate rates; the per-opportunity opt-in structure is a mitigation, not a
   safe harbor. Counsel to advise whether a provider rate-selection mechanism
   is needed.
5. **Background-check + insurance framing, damage offsets, negative-balance
   recovery** — confirm enforceability under CA law (Lab. Code § 221 analog
   arguments if reclassified).
6. **Municipal nexus for ClearKey itself** (SF business registration etc.) —
   separate analysis; provider-side licensing responsibility now contractual.

## Implementation log (this pass)

- ICA substantially expanded (see git history).
- Customer Agreement, CPA, Payment Services Terms wording updated.
- Customer/cleaner en i18n: "assigned" → "matched".
- No product-behavior changes made (Part 5 items await decisions).
