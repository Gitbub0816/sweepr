/**
 * Claude Haiku adjudication for Checkr background check `consider` reports.
 *
 * FCRA compliance note: Haiku can ONLY recommend `engage` (clear the candidate)
 * or `flag` (route to human admin). It CANNOT initiate adverse action — that
 * requires human review + pre-adverse notice delivered by Checkr. We never
 * auto-adverse.
 */

import type { CheckrReport } from "./checkr";
import type { Env } from "../types";
import { logger } from "./logger";

export type AdjudicationResult =
  | { recommendation: "engage"; reasoning: string }
  | { recommendation: "flag"; reasoning: string };

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export async function adjudicateConsiderReport(
  report: CheckrReport,
  env: Env
): Promise<AdjudicationResult | null> {
  if (!env.ANTHROPIC_API_KEY) return null;

  const prompt = `You are an FCRA-compliant background check adjudicator for Sweepr, a home cleaning platform.
A background check returned a "consider" status (not automatically clear).

Report summary:
- Report ID: ${report.id}
- Status: ${report.status}
- Adjudication: ${report.adjudication ?? "none"}
- Package: ${report.package ?? "unknown"}
- Turnaround time: ${report.turnaround_time ?? "unknown"} hours

Evaluate whether this candidate should be engaged (cleared) or flagged for human admin review.

IMPORTANT rules:
1. You can ONLY recommend "engage" or "flag" — never "adverse_action" (that requires human review).
2. Recommend "engage" only if the record(s) are clearly minor, old (7+ years), or unrelated to home service work.
3. Recommend "flag" if there are violent, theft, or property-related offenses, or anything that could pose risk in a customer's home.
4. If records are ambiguous or you're unsure, recommend "flag".

Respond with ONLY valid JSON: {"recommendation":"engage","reasoning":"<one sentence>"} or {"recommendation":"flag","reasoning":"<one sentence>"}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      logger.error("Haiku adjudication API error", { status: res.status });
      return null;
    }

    const data = await res.json() as {
      content?: Array<{ type: string; text: string }>;
    };
    const text = data.content?.find((b) => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(text) as AdjudicationResult;
    if (parsed.recommendation !== "engage" && parsed.recommendation !== "flag") {
      return null;
    }
    return parsed;
  } catch (err) {
    logger.error("Haiku adjudication failed", { err: String(err) });
    return null;
  }
}
