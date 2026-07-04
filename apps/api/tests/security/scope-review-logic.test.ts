/**
 * Scope review pure-logic tests: confidence routing, AAF fee resolution,
 * refusal-fee clamp math, and unit-aware greylist key normalization.
 *
 * These are the money/decision-affecting functions and must be exercisable
 * without any network or DB binding.
 */
import { describe, it, expect } from "vitest";
import {
  routeByConfidence,
  aafFeeCents,
  computeRefusalFeeCents,
  normalizedGreylistKey,
  isAafFeeCode,
  type ScopeReviewSettings,
} from "../../src/lib/scopeReviewEngine";

const settings: ScopeReviewSettings = {
  feeSmallCents: 2500,
  feeMediumCents: 5000,
  feeLargeCents: 10000,
  refusalMinCents: 5000,
  refusalMaxCents: 20000,
  refusalPct: 20,
  abuseRequestRatePct: 70,
  abuseDenialRatePct: 70,
  abuseMinJobs: 10,
  privilegeDisableDays: 180,
  suspensionDays: 180,
  investigatingDays: 180,
  autoCancelOnHighConfidenceRefusal: false,
};

describe("routeByConfidence", () => {
  it("95+ → pending_admin, strong approve", () => {
    expect(routeByConfidence(95)).toEqual({ status: "pending_admin", emailKind: "strong_approve" });
    expect(routeByConfidence(100).status).toBe("pending_admin");
  });
  it("75-94 → pending_admin, standard", () => {
    expect(routeByConfidence(75)).toEqual({ status: "pending_admin", emailKind: "standard" });
    expect(routeByConfidence(94).emailKind).toBe("standard");
  });
  it("50-74 → denied (auto)", () => {
    expect(routeByConfidence(50).status).toBe("denied");
    expect(routeByConfidence(74).emailKind).toBe("auto_denied");
  });
  it("<50 → hard_denied", () => {
    expect(routeByConfidence(49).status).toBe("hard_denied");
    expect(routeByConfidence(0).emailKind).toBe("hard_denied");
  });
});

describe("aafFeeCents", () => {
  it("resolves each AAF tier from settings", () => {
    expect(aafFeeCents("additional_attention_small", settings)).toBe(2500);
    expect(aafFeeCents("additional_attention_medium", settings)).toBe(5000);
    expect(aafFeeCents("additional_attention_large", settings)).toBe(10000);
  });
  it("returns null for non-AAF codes", () => {
    expect(aafFeeCents("none", settings)).toBeNull();
    expect(aafFeeCents("refusal_fee", settings)).toBeNull();
  });
});

describe("isAafFeeCode", () => {
  it("accepts only AAF tiers", () => {
    expect(isAafFeeCode("additional_attention_small")).toBe(true);
    expect(isAafFeeCode("none")).toBe(false);
    expect(isAafFeeCode("refusal_fee")).toBe(false);
    expect(isAafFeeCode(null)).toBe(false);
  });
});

describe("computeRefusalFeeCents", () => {
  it("applies percentage within bounds", () => {
    // 20% of $500.00 = $100.00 → within [50,200]
    expect(computeRefusalFeeCents(50000, settings)).toBe(10000);
  });
  it("clamps to the minimum", () => {
    // 20% of $100.00 = $20.00 → below $50 min → $50
    expect(computeRefusalFeeCents(10000, settings)).toBe(5000);
  });
  it("clamps to the maximum", () => {
    // 20% of $2000.00 = $400.00 → above $200 max → $200
    expect(computeRefusalFeeCents(200000, settings)).toBe(20000);
  });
});

describe("normalizedGreylistKey", () => {
  it("lowercases and trims street/unit and keeps zip", () => {
    expect(normalizedGreylistKey("  123 Main St ", " 4B ", "94541")).toBe("123 main st|4b|94541");
  });
  it("treats different units as distinct", () => {
    const a = normalizedGreylistKey("123 Main St", "3A", "94541");
    const b = normalizedGreylistKey("123 Main St", "3B", "94541");
    expect(a).not.toBe(b);
  });
  it("handles missing unit", () => {
    expect(normalizedGreylistKey("123 Main St", null, "94541")).toBe("123 main st||94541");
  });
});
