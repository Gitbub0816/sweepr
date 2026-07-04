/**
 * AI vision scope review (backend-only boundary).
 *
 * The frontend NEVER calls OpenAI directly — this module is the sole place the
 * key is used. Given a scope-review request (booking scope, cleaner notes,
 * photos, and history), it asks a vision model to triage whether the job
 * qualifies for an Additional Attention Fee or a full service refusal, and how
 * confident it is.
 *
 * The model output is a strict JSON schema mirroring AiScopeReviewResult. We
 * still defensively validate/clamp with zod: a malformed or failed response
 * degrades to `human_review` at confidence 0 (never crashes the request flow),
 * and the raw error is preserved so admins can see what happened.
 */
import { z } from "zod";
import type { Env } from "../types";
import type { AiScopeReviewResult } from "@sweepr/types";
import { logger } from "./logger";

export interface ScopeReviewAiInput {
  requestType: "additional_attention" | "refusal";
  package: string | null;
  selectedCleaningLevel: string | null;
  addOns: string[];
  cleanerNotes: string | null;
  refusalReason: string | null;
  /** Publicly-readable photo URLs (R2 public bucket) passed to the vision model. */
  photoUrls: string[];
  customerHistorySummary: string;
  cleanerHistorySummary: string;
}

const DEFAULT_MODEL = "gpt-4.1-mini";

const safetyFlagsSchema = z.object({
  biohazard: z.boolean(),
  hoarding_indicators: z.boolean(),
  blocked_access: z.boolean(),
  animal_hazard: z.boolean(),
  unsafe_environment: z.boolean(),
  visible_damage_risk: z.boolean(),
});

const resultSchema = z.object({
  decision_recommendation: z.enum(["approve", "deny", "human_review", "hard_deny"]),
  confidence: z.number(),
  scope_level_detected: z.enum([
    "refresh",
    "extra_attention",
    "significant_attention",
    "refusal_required",
    "unsafe_or_excluded",
  ]),
  primary_reason: z.string(),
  supporting_observations: z.array(z.string()),
  missing_evidence: z.array(z.string()),
  customer_facing_summary: z.string(),
  admin_summary: z.string(),
  recommended_fee_code: z.enum([
    "none",
    "additional_attention_small",
    "additional_attention_medium",
    "additional_attention_large",
    "refusal_fee",
  ]),
  safety_flags: safetyFlagsSchema,
});

/** JSON schema handed to OpenAI (strict structured outputs). */
const JSON_SCHEMA = {
  name: "scope_review_result",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      decision_recommendation: { type: "string", enum: ["approve", "deny", "human_review", "hard_deny"] },
      confidence: { type: "number", description: "0-100 confidence in the recommendation" },
      scope_level_detected: {
        type: "string",
        enum: ["refresh", "extra_attention", "significant_attention", "refusal_required", "unsafe_or_excluded"],
      },
      primary_reason: { type: "string" },
      supporting_observations: { type: "array", items: { type: "string" } },
      missing_evidence: { type: "array", items: { type: "string" } },
      customer_facing_summary: { type: "string" },
      admin_summary: { type: "string" },
      recommended_fee_code: {
        type: "string",
        enum: [
          "none",
          "additional_attention_small",
          "additional_attention_medium",
          "additional_attention_large",
          "refusal_fee",
        ],
      },
      safety_flags: {
        type: "object",
        additionalProperties: false,
        properties: {
          biohazard: { type: "boolean" },
          hoarding_indicators: { type: "boolean" },
          blocked_access: { type: "boolean" },
          animal_hazard: { type: "boolean" },
          unsafe_environment: { type: "boolean" },
          visible_damage_risk: { type: "boolean" },
        },
        required: [
          "biohazard",
          "hoarding_indicators",
          "blocked_access",
          "animal_hazard",
          "unsafe_environment",
          "visible_damage_risk",
        ],
      },
    },
    required: [
      "decision_recommendation",
      "confidence",
      "scope_level_detected",
      "primary_reason",
      "supporting_observations",
      "missing_evidence",
      "customer_facing_summary",
      "admin_summary",
      "recommended_fee_code",
      "safety_flags",
    ],
  },
} as const;

const SYSTEM_PROMPT = `You are the scope-review adjudicator for a residential cleaning marketplace. A cleaner has arrived at a job and is asking either for an "Additional Attention Fee" (AAF) because the home is dirtier than the package they were booked for, or to refuse the job entirely because it is unsafe or far outside scope. You review photographic and textual evidence and produce a strict, conservative recommendation. The customer already paid for a package tier; a fee or refusal is money/impact for them, so the bar for approval is HIGH and must be visually justified.

CLEANING LEVEL / PACKAGE SCOPE RULES:
- "refresh": normal light dust, light everyday use, limited clutter. This is the baseline a standard clean covers. Approve an AAF ONLY when photos show a CLEAR mismatch — the home is visibly at a heavier tier than refresh.
- "extra_attention": moderate buildup, visible pet hair, moderate clutter, some grime. If the booked level is already extra_attention, usually DENY an AAF unless the actual condition clearly EXCEEDS this tier.
- "significant_attention": heavy buildup, heavy grime, heavy clutter, neglected surfaces. If booked at this level, usually DENY unless the condition is approaching refusal-level (unsafe/hazard).
- "refusal_required": genuinely unsafe or excluded conditions — hoarding, biohazard (feces, blood, vomit, mold at scale), animal waste/infestation, pests/insect infestation, blocked or inaccessible areas, structural hazards, or scope so far beyond the package that no reasonable single clean covers it.

DECISION RULES:
- Map recommended_fee_code to the detected severity for AAF requests: a modest one-tier mismatch → additional_attention_small; a clear two-tier / heavier mismatch → additional_attention_medium; extreme buildup approaching (but not) refusal → additional_attention_large. For refusal requests that are justified → refusal_fee. When you would deny, use "none".
- decision_recommendation "approve": evidence clearly supports the requested fee/refusal.
- "deny": evidence does not support it (condition matches or is lighter than the booked package).
- "hard_deny": evidence contradicts the request or is so weak/absent that no additional fee or refusal is warranted at all.
- "human_review": genuinely ambiguous, conflicting, or insufficient but plausible — needs a human.
- confidence is 0-100 and reflects how strongly the EVIDENCE supports your recommendation.
- Be conservative: if photos do not actually show the claimed condition, do not approve. Note anything you needed but did not get in missing_evidence.
- customer_facing_summary: neutral, non-accusatory, safe to show a customer. admin_summary: candid internal detail.
- Set safety_flags true only when the photos/notes actually indicate that hazard.
- Never invent facts not supported by the evidence.`;

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function fallback(reason: string, raw?: unknown): AiScopeReviewResult & { _error: string } {
  return {
    decision_recommendation: "human_review",
    confidence: 0,
    scope_level_detected: "extra_attention",
    primary_reason: "Automated review unavailable — routed to a human for manual review.",
    supporting_observations: [],
    missing_evidence: ["Automated vision review could not be completed."],
    customer_facing_summary: "This request is being reviewed by our team.",
    admin_summary: `AI scope review failed: ${reason}. Manual review required.`,
    recommended_fee_code: "none",
    safety_flags: {
      biohazard: false,
      hoarding_indicators: false,
      blocked_access: false,
      animal_hazard: false,
      unsafe_environment: false,
      visible_damage_risk: false,
    },
    _error: typeof raw === "string" ? raw : reason,
  };
}

/**
 * Run the vision scope review. Always resolves — on any API/parse failure it
 * returns a `human_review` fallback with an `_error` describing the failure so
 * the caller can persist it in ai_response_json.
 */
export async function runScopeReview(
  env: Env,
  input: ScopeReviewAiInput,
): Promise<AiScopeReviewResult & { _error?: string }> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return fallback("OPENAI_API_KEY not configured");

  const model = env.OPENAI_VISION_MODEL ?? DEFAULT_MODEL;

  const textBlock = [
    `REQUEST TYPE: ${input.requestType === "refusal" ? "Service refusal" : "Additional Attention Fee"}`,
    `BOOKED PACKAGE: ${input.package ?? "unknown"}`,
    `CUSTOMER-DECLARED CLEANING LEVEL: ${input.selectedCleaningLevel ?? "unknown"}`,
    `ADD-ONS PURCHASED: ${input.addOns.length ? input.addOns.join(", ") : "none"}`,
    input.refusalReason ? `REFUSAL REASON (cleaner-selected): ${input.refusalReason}` : null,
    `CLEANER NOTES: ${input.cleanerNotes?.trim() || "(none provided)"}`,
    `CUSTOMER HISTORY: ${input.customerHistorySummary}`,
    `CLEANER HISTORY: ${input.cleanerHistorySummary}`,
    `PHOTOS ATTACHED: ${input.photoUrls.length}`,
  ]
    .filter(Boolean)
    .join("\n");

  const content: Array<Record<string, unknown>> = [{ type: "text", text: textBlock }];
  for (const url of input.photoUrls.slice(0, 12)) {
    content.push({ type: "image_url", image_url: { url } });
  }

  let rawText = "";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_schema", json_schema: JSON_SCHEMA },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error("scopeReview.openai non-ok", undefined, { status: res.status });
      return fallback(`OpenAI ${res.status}`, body.slice(0, 800));
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    rawText = json.choices?.[0]?.message?.content ?? "";
    if (!rawText) return fallback("Empty model response");

    const parsed = resultSchema.parse(JSON.parse(rawText));
    return { ...parsed, confidence: clampConfidence(parsed.confidence) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("scopeReview.openai parse/call failed", err, {});
    return fallback(msg, rawText || msg);
  }
}
