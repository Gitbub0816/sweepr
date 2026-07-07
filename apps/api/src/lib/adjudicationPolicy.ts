/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Background Check Adjudication Engine — deterministic policy rules.
 *
 * Implements the Sweepr Background Check Adjudication Policy (legal doc slug
 * background-check-adjudication): given an applicant's CONVICTIONS (and any
 * pending charges), produce a deterministic decision:
 *
 *   - auto_deny          a conviction (or combination) meets an Automatic
 *                        Denial criterion
 *   - executive_review   outside the automatic-denial window, or a pattern of
 *                        conduct requiring individualized review
 *   - hold               pending charge — application waits for final
 *                        disposition (pending cases must be resolved before a
 *                        candidate can be considered)
 *   - auto_approve       nothing on the record engages the policy
 *
 * Convictions only: arrests without conviction, dismissals, acquittals and
 * sealed/expunged records are never evaluated (enforced upstream and
 * re-checked here via `isConviction`). This engine is pure and unit-tested;
 * provider integrations map raw report records into `ConvictionInput` before
 * calling it. It is provider-agnostic (Checkr today, replaceable later).
 *
 * FCRA note: an `auto_deny` decision starts the adverse-action process (pre-
 * adverse notice, waiting period, final notice) — it must never silently
 * terminate an application. The AI helper in adjudication.ts (Haiku
 * engage/flag on `consider` reports) remains a separate, non-binding signal.
 */

/** Offense categories from the policy, in decreasing severity order. */
export const OFFENSE_CATEGORIES = [
  "permanent",              // Permanent Disqualifying Convictions
  "high_trust",             // High Trust Crimes (theft/fraud/burglary…)
  "violent_felony",         // Violent Felonies
  "multiple_dui",           // 2nd-or-subsequent DUI
  "dui",                    // Single DUI
  "drug_manufacturing",     // Manufacturing Controlled Substances
  "drug_distribution",      // Drug Distribution
  "drug_possession",        // Simple Possession
  "violent_misdemeanor",    // Violent Misdemeanors
  "nonviolent_misdemeanor", // Nonviolent Misdemeanors
] as const;
export type OffenseCategory = (typeof OFFENSE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<OffenseCategory, string> = {
  permanent: "Permanent disqualifying conviction",
  high_trust: "High trust crime",
  violent_felony: "Violent felony",
  multiple_dui: "Multiple DUI",
  dui: "DUI (single)",
  drug_manufacturing: "Manufacturing controlled substances",
  drug_distribution: "Drug distribution",
  drug_possession: "Simple possession",
  violent_misdemeanor: "Violent misdemeanor",
  nonviolent_misdemeanor: "Nonviolent misdemeanor",
};

/**
 * Automatic-denial window per category, in months since conviction.
 * `Infinity` = permanent. Convictions older than the window go to Executive
 * Review (never automatic approval once a conviction engages a category).
 */
export const DENIAL_WINDOW_MONTHS: Record<OffenseCategory, number> = {
  permanent: Infinity,
  high_trust: 120,             // 10 years
  violent_felony: 120,         // 10 years
  multiple_dui: 120,           // 10 years
  dui: 84,                     // 7 years
  drug_manufacturing: 120,     // 10 years
  drug_distribution: 84,       // 7 years
  drug_possession: 36,         // 3 years
  violent_misdemeanor: 60,     // 5 years
  nonviolent_misdemeanor: 24,  // 24 months
};

/** Categories that count as "misdemeanors" for the pattern rules. */
const MISDEMEANOR_CATEGORIES: OffenseCategory[] = ["violent_misdemeanor", "nonviolent_misdemeanor"];
/** Categories that count as "theft-related" for the pattern rules. */
const THEFT_CATEGORIES: OffenseCategory[] = ["high_trust"];
/** Categories that count as "violent" for the pattern rules. */
const VIOLENT_CATEGORIES: OffenseCategory[] = ["permanent", "violent_felony", "violent_misdemeanor"];

export interface ConvictionInput {
  category: OffenseCategory;
  /** Free-text offense name as it appears on the report (audit trail). */
  offense: string;
  /** ISO date (YYYY-MM-DD) of conviction. */
  convictionDate: string;
  /** Must be true — the engine only evaluates convictions. */
  isConviction: boolean;
}

export interface PendingChargeInput {
  /** Category the charge WOULD fall into if it became a conviction. */
  category: OffenseCategory;
  offense: string;
}

export type AdjudicationDecision = "auto_approve" | "auto_deny" | "executive_review" | "hold";

export interface PolicyAdjudicationResult {
  decision: AdjudicationDecision;
  /** Human-readable reasons, one per rule that fired (audit trail). */
  reasons: string[];
  /** Stable rule identifiers that fired (analytics/tests). */
  rules: string[];
}

function monthsBetween(fromISO: string, to: Date): number {
  const from = new Date(fromISO + "T00:00:00Z");
  if (Number.isNaN(from.getTime())) return 0; // unparseable date → treat as recent (fail safe)
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

/**
 * Evaluate a record under the Background Check Adjudication Policy.
 *
 * Precedence: hold (pending charge) > auto_deny > executive_review >
 * auto_approve. A pending charge pauses the application regardless of the
 * rest of the record.
 */
export function adjudicate(
  convictions: ConvictionInput[],
  pendingCharges: PendingChargeInput[] = [],
  now: Date = new Date(),
): PolicyAdjudicationResult {
  const reasons: string[] = [];
  const rules: string[] = [];

  // Only convictions are evaluated — defensively drop anything else.
  const convicted = convictions.filter((c) => c.isConviction);

  // 1) Pending charges hold the application until final disposition.
  if (pendingCharges.length > 0) {
    for (const p of pendingCharges) {
      reasons.push(
        `Pending charge (${CATEGORY_LABELS[p.category]}: ${p.offense}) — application on hold until final disposition.`,
      );
    }
    rules.push("pending_charges_hold");
    return { decision: "hold", reasons, rules };
  }

  // 2) Per-conviction category rules.
  let needsReview = false;
  for (const c of convicted) {
    const windowMonths = DENIAL_WINDOW_MONTHS[c.category];
    const age = monthsBetween(c.convictionDate, now);
    if (windowMonths === Infinity) {
      reasons.push(`${CATEGORY_LABELS.permanent}: ${c.offense} — permanent disqualification.`);
      rules.push("permanent_disqualification");
      return { decision: "auto_deny", reasons, rules };
    }
    if (age < windowMonths) {
      const yrs = Math.round((windowMonths / 12) * 10) / 10;
      reasons.push(
        `${CATEGORY_LABELS[c.category]}: ${c.offense} (${c.convictionDate}) is within the ${yrs}-year automatic-denial window.`,
      );
      rules.push(`window_deny:${c.category}`);
      return { decision: "auto_deny", reasons, rules };
    }
    reasons.push(
      `${CATEGORY_LABELS[c.category]}: ${c.offense} (${c.convictionDate}) is outside the automatic-denial window — Executive Review required.`,
    );
    rules.push(`window_review:${c.category}`);
    needsReview = true;
  }

  // 3) Pattern-of-conduct rules (Executive Review regardless of category).
  const misdemeanors = convicted.filter((c) => MISDEMEANOR_CATEGORIES.includes(c.category));
  if (misdemeanors.length >= 3) {
    reasons.push(`Pattern: ${misdemeanors.length} misdemeanor convictions — Executive Review required.`);
    rules.push("pattern_misdemeanors");
    needsReview = true;
  }
  if (convicted.filter((c) => THEFT_CATEGORIES.includes(c.category)).length >= 2) {
    reasons.push("Pattern: multiple theft-related convictions — Executive Review required.");
    rules.push("pattern_theft");
    needsReview = true;
  }
  if (convicted.filter((c) => VIOLENT_CATEGORIES.includes(c.category)).length >= 2) {
    reasons.push("Pattern: multiple violent convictions — Executive Review required.");
    rules.push("pattern_violent");
    needsReview = true;
  }
  const categories = new Set(convicted.map((c) => c.category));
  if (convicted.length >= 2 && categories.size >= 2) {
    reasons.push("Pattern: convictions across multiple offense categories — Executive Review required.");
    rules.push("pattern_multi_category");
    needsReview = true;
  }

  if (needsReview) return { decision: "executive_review", reasons, rules };

  // 4) Nothing engaged the policy.
  reasons.push("No disqualifying convictions or pending charges under the Background Check Adjudication Policy.");
  rules.push("clean_record");
  return { decision: "auto_approve", reasons, rules };
}
