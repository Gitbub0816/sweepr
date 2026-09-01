/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

// NOTE: Adjudication matrices interact with federal, state and local fair-
// hiring law (FCRA, state fair-chance acts, local ordinances). Counsel must
// confirm the categories, look-back windows, and adverse-action workflow
// before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";

const toc = [
  { id: "statement", title: "Policy Statement" },
  { id: "purpose", title: "Purpose & Scope" },
  { id: "principles", title: "Guiding Principles" },
  { id: "definitions", title: "Definitions" },
  { id: "results", title: "Evaluation of Background Check Results" },
  { id: "permanent", title: "Permanent Disqualifying Convictions" },
  { id: "high-trust", title: "High Trust Crimes" },
  { id: "violent-felonies", title: "Violent Felonies" },
  { id: "dui", title: "Driving Under the Influence" },
  { id: "drug", title: "Drug Crimes" },
  { id: "violent-misdemeanors", title: "Violent Misdemeanors" },
  { id: "nonviolent-misdemeanors", title: "Nonviolent Misdemeanors" },
  { id: "pattern", title: "Pattern of Criminal Conduct" },
  { id: "pending", title: "Pending Criminal Charges" },
  { id: "review-factors", title: "Executive Review Factors" },
  { id: "auto-approval", title: "Automatic Approval" },
  { id: "authority", title: "Decision Authority" },
  { id: "notification", title: "Applicant Notification & Adverse Action" },
  { id: "changes", title: "Policy Changes" },
];

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 border-l-4 border-slate-400 bg-slate-50 px-4 py-3 dark:border-slate-500 dark:bg-slate-900">
      {children}
    </div>
  );
}

export function BackgroundCheckAdjudicationPolicy() {
  return (
    <DocPage
      title="Background Check Adjudication Policy"
      version="1.0.0"
      effectiveDate="TBD"
      intro="This Policy establishes the minimum criminal background standards used by Sweepr when determining an applicant's eligibility to provide services through the platform. Policy Owner: Trust & Safety Department. Approved By: Executive Leadership. Applies To: all applicants seeking to provide services through the Sweepr platform."
      toc={toc}
    >
      <Section id="statement" title="1. Policy Statement">
        <p>
          This Background Check Adjudication Policy (this "<strong>Policy</strong>") is adopted and
          maintained by <strong>ClearKey Solutions, LLC, a California limited liability company,
          doing business as Sweepr</strong> ("<strong>Sweepr</strong>," "we," "us," or "our").
        </p>
        <p>
          Sweepr is a technology platform that connects independent cleaning professionals
          ("<strong>Applicants</strong>" prior to approval; "Cleaners" thereafter) with customers
          requesting residential cleaning services. Because approved service providers are granted
          access to customers' homes, personal property, and, in many cases, unsupervised access to
          occupied or unoccupied residences, Sweepr maintains heightened background screening
          standards designed to protect customer safety, preserve marketplace trust, and reduce
          foreseeable risk.
        </p>
        <p>
          This Policy is intended to promote consistent, objective, and defensible decision-making
          while complying with applicable federal, state, and local laws, including the Fair Credit
          Reporting Act, 15 U.S.C. § 1681 et seq. ("<strong>FCRA</strong>"), and other applicable
          fair-hiring and fair-chance laws. Where any provision of this Policy conflicts with a
          requirement of applicable law in a given jurisdiction, the requirement of applicable law
          controls in that jurisdiction and the remainder of this Policy continues in effect.
        </p>
      </Section>

      <Section id="purpose" title="2. Purpose & Scope">
        <p>
          The purpose of this Policy is to establish consistent, objective, and defensible standards
          for evaluating criminal background checks while balancing customer safety, fairness,
          rehabilitation, and legal compliance. Because Cleaners routinely enter customers' homes, 
          often while customers are absent, Sweepr maintains screening standards that are more
          stringent than those of many employers or comparable platforms.
        </p>
        <p>
          This Policy applies to <strong>all Applicants</strong> seeking approval to perform
          services through the Sweepr platform, and to re-screening of existing Cleaners where
          permitted by applicable law and the applicable disclosures and authorizations. This Policy
          governs adjudication only; the separate{" "}
          <Link to="/background-check-disclosure">Background Check Disclosure</Link> and{" "}
          <Link to="/background-check-authorization">Authorization</Link> govern how consumer
          reports are obtained.
        </p>
      </Section>

      <Section id="principles" title="3. Guiding Principles">
        <p>Background screening decisions under this Policy shall prioritize, in order of importance:</p>
        <ol>
          <li>Customer safety;</li>
          <li>Trust in the marketplace;</li>
          <li>Protection of customer property;</li>
          <li>Consistent decision-making;</li>
          <li>Compliance with applicable law; and</li>
          <li>Individualized review where appropriate.</li>
        </ol>
      </Section>

      <Section id="definitions" title="4. Definitions">
        <p>
          "<strong>Automatic Approval</strong>" means the Applicant is approved for the platform on
          the basis of the background screening without additional review, subject to satisfaction
          of all other onboarding requirements.
        </p>
        <p>
          "<strong>Automatic Denial</strong>" means the Applicant is denied access to the platform
          on the basis of a conviction (or combination of convictions) meeting the criteria set out
          in this Policy, subject in every case to the applicant-notification and adverse-action
          procedures described in Section 18.
        </p>
        <p>
          "<strong>Executive Review</strong>" means a discretionary, individualized review performed
          by authorized Sweepr Trust &amp; Safety personnel. Executive Review may consider, without
          limitation: time elapsed since the conviction; completion of sentence, probation, or
          parole; evidence of rehabilitation; employment history; character references; the nature
          and pattern of criminal conduct; the relationship of the offense to the duties performed
          inside customers' homes; and any additional information voluntarily provided by the
          Applicant. <strong>Executive Review does not guarantee approval.</strong>
        </p>
        <p>
          "<strong>Conviction</strong>" means a finding or plea of guilty (including pleas of nolo
          contendere) that has resulted in a judgment of conviction, to the extent such record may
          lawfully be considered in the relevant jurisdiction.
        </p>
      </Section>

      <Section id="results" title="5. Evaluation of Background Check Results">
        <p>
          <strong>Sweepr evaluates convictions only.</strong> Subject to applicable law, the
          following shall <em>not</em> independently result in denial:
        </p>
        <ul>
          <li>Arrests that did not result in a conviction;</li>
          <li>Charges that were dismissed;</li>
          <li>Acquittals and findings of not guilty;</li>
          <li>Records that have been expunged or sealed, wherever consideration is prohibited by law; and</li>
          <li>Matters resolved through diversion or deferred adjudication where the record may not lawfully be considered.</li>
        </ul>
        <p>
          Pending criminal charges are addressed in Section 14. Pending investigations that have not
          resulted in filed criminal charges are not considered.
        </p>
      </Section>

      <Section id="permanent" title="6. Permanent Disqualifying Convictions">
        <p>
          A conviction for any of the following offenses (or a substantially equivalent offense in
          any jurisdiction) permanently disqualifies an Applicant, regardless of the age of the
          conviction:
        </p>
        <ul>
          <li>Murder or attempted murder;</li>
          <li>Voluntary manslaughter;</li>
          <li>Kidnapping;</li>
          <li>Human trafficking;</li>
          <li>Sexual assault or rape;</li>
          <li>Child sexual abuse or child exploitation;</li>
          <li>Any offense requiring registration as a sex offender;</li>
          <li>Child abuse;</li>
          <li>Elder abuse;</li>
          <li>Home invasion; and</li>
          <li>Armed robbery involving an occupied residence.</li>
        </ul>
        <Rule>
          <strong>Rule.</strong> Conviction at any time → <strong>Automatic Denial</strong>
          (permanent; not eligible for Executive Review).
        </Rule>
      </Section>

      <Section id="high-trust" title="7. High Trust Crimes">
        <p>
          The following offenses directly impact the trust required to enter customers' homes:
          residential burglary; burglary of an occupied structure; grand theft; identity theft;
          embezzlement; forgery; fraud; financial exploitation; theft from an employer; theft from a
          customer; and felony receiving stolen property.
        </p>
        <Rule>
          <strong>Rule.</strong> Conviction within the previous <strong>10 years</strong> →
          Automatic Denial. Convictions older than 10 years → Executive Review.
        </Rule>
      </Section>

      <Section id="violent-felonies" title="8. Violent Felonies">
        <p>
          Violent felonies include, without limitation: aggravated assault; felony domestic
          violence; armed assault; robbery; and battery causing serious bodily injury.
        </p>
        <Rule>
          <strong>Rule.</strong> Conviction within the previous <strong>10 years</strong> →
          Automatic Denial. Older convictions → Executive Review.
        </Rule>
      </Section>

      <Section id="dui" title="9. Driving Under the Influence">
        <p><strong>Single DUI conviction.</strong></p>
        <Rule>
          <strong>Rule.</strong> Conviction within the previous <strong>7 years</strong> →
          Automatic Denial. Older convictions → Executive Review.
        </Rule>
        <p><strong>Multiple DUI convictions.</strong></p>
        <Rule>
          <strong>Rule.</strong> Any second or subsequent DUI conviction within the previous{" "}
          <strong>10 years</strong> → Automatic Denial. Older convictions → Executive Review.
        </Rule>
      </Section>

      <Section id="drug" title="10. Drug Crimes">
        <p><strong>Drug distribution.</strong></p>
        <Rule>
          <strong>Rule.</strong> Conviction within the previous <strong>7 years</strong> →
          Automatic Denial. Executive Review thereafter.
        </Rule>
        <p><strong>Manufacturing controlled substances.</strong></p>
        <Rule>
          <strong>Rule.</strong> Conviction within the previous <strong>10 years</strong> →
          Automatic Denial. Executive Review thereafter.
        </Rule>
        <p><strong>Simple possession.</strong></p>
        <Rule>
          <strong>Rule.</strong> Conviction within the previous <strong>3 years</strong> →
          Automatic Denial. Executive Review thereafter.
        </Rule>
      </Section>

      <Section id="violent-misdemeanors" title="11. Violent Misdemeanors">
        <p>
          Violent misdemeanors include, without limitation: assault; battery; domestic violence;
          criminal threats; stalking; and brandishing a weapon.
        </p>
        <Rule>
          <strong>Rule.</strong> Conviction within the previous <strong>5 years</strong> →
          Automatic Denial. Executive Review thereafter.
        </Rule>
      </Section>

      <Section id="nonviolent-misdemeanors" title="12. Nonviolent Misdemeanors">
        <p>
          Nonviolent misdemeanors include, without limitation: petty theft; disorderly conduct;
          criminal mischief; and minor property damage.
        </p>
        <Rule>
          <strong>Rule.</strong> Conviction within the previous <strong>24 months</strong> →
          Automatic Denial. Executive Review thereafter.
        </Rule>
      </Section>

      <Section id="pattern" title="13. Pattern of Criminal Conduct">
        <p>
          Regardless of offense category, <strong>Executive Review is required</strong> whenever any
          of the following exists:
        </p>
        <ul>
          <li>Three or more misdemeanor convictions;</li>
          <li>Multiple theft-related convictions;</li>
          <li>Multiple violent convictions;</li>
          <li>A pattern demonstrating ongoing criminal behavior; or</li>
          <li>Multiple convictions across multiple offense categories.</li>
        </ul>
        <p>Approval following Executive Review under this Section is discretionary.</p>
      </Section>

      <Section id="pending" title="14. Pending Criminal Charges">
        <p>
          Where legally permissible, an application from an Applicant with pending criminal charges
          shall be <strong>placed on hold until final disposition</strong> of those charges. Pending
          cases and charges must be resolved before a candidate can be considered for the platform.
          Pending investigations that have not resulted in filed criminal charges are not
          considered.
        </p>
      </Section>

      <Section id="review-factors" title="15. Executive Review Factors">
        <p>Executive Review may consider, without limitation:</p>
        <ul>
          <li>Age at the time of the offense;</li>
          <li>Time elapsed since the offense;</li>
          <li>The number of offenses;</li>
          <li>Completion of probation or parole;</li>
          <li>Evidence of rehabilitation;</li>
          <li>Stable employment history;</li>
          <li>Character references;</li>
          <li>Evidence of community involvement;</li>
          <li>Subsequent criminal history; and</li>
          <li>Whether the offense directly impacts trust and safety within customers' homes.</li>
        </ul>
        <p>No single factor guarantees approval.</p>
      </Section>

      <Section id="auto-approval" title="16. Automatic Approval">
        <p>Applicants are automatically approved under this Policy when all of the following are true:</p>
        <ul>
          <li>No reportable criminal convictions exist that engage this Policy;</li>
          <li>No pending disqualifying criminal matters exist (where legally permissible to consider); and</li>
          <li>The background screening otherwise satisfies Sweepr's requirements.</li>
        </ul>
        <p>
          Automatic Approval under this Policy addresses criminal background only and does not waive
          any other onboarding requirement (identity verification, training, insurance, and the like).
        </p>
      </Section>

      <Section id="authority" title="17. Decision Authority">
        <p>Only authorized Trust &amp; Safety personnel may:</p>
        <ul>
          <li>Override an Executive Review recommendation;</li>
          <li>Grant exceptions to this Policy; or</li>
          <li>Approve an Applicant following Executive Review.</li>
        </ul>
        <p>Exceptions are expected to be rare and must be documented in the adjudication record.</p>
      </Section>

      <Section id="notification" title="18. Applicant Notification & Adverse Action">
        <p>
          Applicants denied on the basis of background screening shall receive all notices required
          under applicable law, including, where the FCRA applies, a pre-adverse action notice with
          a copy of the consumer report and the CFPB Summary of Rights, a reasonable waiting period
          in which to dispute or supplement the record, and a final adverse action notice. See the{" "}
          <Link to="/background-check-adverse-action">Background Check Adverse Action</Link>{" "}
          process. No automatic decision under this Policy takes final effect until the notification
          process required by applicable law has been completed.
        </p>
      </Section>

      <Section id="changes" title="19. Policy Changes">
        <p>
          Sweepr reserves the right to modify this Policy at any time to maintain customer safety
          and comply with changing legal requirements. Future changes apply prospectively unless
          otherwise required by law. The version and effective date shown at the top of this
          document identify the operative text.
        </p>
      </Section>
    </DocPage>
  );
}
