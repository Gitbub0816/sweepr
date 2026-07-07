/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect } from "vitest";
import { adjudicate, type ConvictionInput } from "../src/lib/adjudicationPolicy";

const NOW = new Date("2026-07-07T00:00:00Z");

function conv(category: ConvictionInput["category"], yearsAgo: number, offense = "test offense"): ConvictionInput {
  const d = new Date(NOW);
  d.setUTCFullYear(d.getUTCFullYear() - Math.floor(yearsAgo));
  d.setUTCMonth(d.getUTCMonth() - Math.round((yearsAgo % 1) * 12));
  return { category, offense, convictionDate: d.toISOString().slice(0, 10), isConviction: true };
}

describe("adjudicate — clean records", () => {
  it("auto-approves an empty record", () => {
    const r = adjudicate([], [], NOW);
    expect(r.decision).toBe("auto_approve");
    expect(r.rules).toContain("clean_record");
  });

  it("ignores non-convictions entirely", () => {
    const r = adjudicate([{ ...conv("permanent", 1, "Murder"), isConviction: false } as ConvictionInput], [], NOW);
    expect(r.decision).toBe("auto_approve");
  });
});

describe("adjudicate — permanent disqualification", () => {
  it("denies permanently regardless of age", () => {
    expect(adjudicate([conv("permanent", 40, "Kidnapping")], [], NOW).decision).toBe("auto_deny");
    expect(adjudicate([conv("permanent", 1, "Sexual Assault")], [], NOW).decision).toBe("auto_deny");
  });
});

describe("adjudicate — time windows", () => {
  const cases: Array<[ConvictionInput["category"], number, number]> = [
    // category, deny-at-years, review-at-years
    ["high_trust", 9, 11],
    ["violent_felony", 9, 11],
    ["multiple_dui", 9, 11],
    ["dui", 6, 8],
    ["drug_manufacturing", 9, 11],
    ["drug_distribution", 6, 8],
    ["drug_possession", 2, 4],
    ["violent_misdemeanor", 4, 6],
    ["nonviolent_misdemeanor", 1, 3],
  ];
  for (const [cat, denyYears, reviewYears] of cases) {
    it(`${cat}: denies at ${denyYears}y, reviews at ${reviewYears}y`, () => {
      expect(adjudicate([conv(cat, denyYears)], [], NOW).decision).toBe("auto_deny");
      expect(adjudicate([conv(cat, reviewYears)], [], NOW).decision).toBe("executive_review");
    });
  }

  it("never auto-approves once a conviction engages a category", () => {
    const r = adjudicate([conv("nonviolent_misdemeanor", 20, "Petty Theft")], [], NOW);
    expect(r.decision).toBe("executive_review");
  });
});

describe("adjudicate — pending charges", () => {
  it("holds the application on any pending charge", () => {
    const r = adjudicate([], [{ category: "nonviolent_misdemeanor", offense: "Petty Theft (pending)" }], NOW);
    expect(r.decision).toBe("hold");
    expect(r.rules).toContain("pending_charges_hold");
  });

  it("hold takes precedence over an otherwise-clean record and over review", () => {
    const r = adjudicate([conv("dui", 9)], [{ category: "dui", offense: "DUI (pending)" }], NOW);
    expect(r.decision).toBe("hold");
  });
});

describe("adjudicate — pattern of conduct", () => {
  it("three misdemeanors outside their windows still require review", () => {
    const r = adjudicate(
      [conv("nonviolent_misdemeanor", 5, "a"), conv("nonviolent_misdemeanor", 6, "b"), conv("nonviolent_misdemeanor", 7, "c")],
      [], NOW,
    );
    expect(r.decision).toBe("executive_review");
    expect(r.rules).toContain("pattern_misdemeanors");
  });

  it("multiple theft-related convictions flag pattern_theft", () => {
    const r = adjudicate([conv("high_trust", 12, "Burglary"), conv("high_trust", 15, "Fraud")], [], NOW);
    expect(r.decision).toBe("executive_review");
    expect(r.rules).toContain("pattern_theft");
  });

  it("multiple violent convictions flag pattern_violent", () => {
    const r = adjudicate([conv("violent_felony", 12, "Robbery"), conv("violent_misdemeanor", 7, "Battery")], [], NOW);
    expect(r.decision).toBe("executive_review");
    expect(r.rules).toContain("pattern_violent");
  });

  it("cross-category convictions flag pattern_multi_category", () => {
    const r = adjudicate([conv("dui", 9, "DUI"), conv("nonviolent_misdemeanor", 4, "Mischief")], [], NOW);
    expect(r.decision).toBe("executive_review");
    expect(r.rules).toContain("pattern_multi_category");
  });

  it("a recent conviction inside its window still auto-denies before pattern review", () => {
    const r = adjudicate([conv("high_trust", 2, "Burglary"), conv("nonviolent_misdemeanor", 10, "Mischief")], [], NOW);
    expect(r.decision).toBe("auto_deny");
  });
});

describe("adjudicate — fail-safe on bad dates", () => {
  it("treats an unparseable conviction date as recent (deny, not approve)", () => {
    const r = adjudicate(
      [{ category: "dui", offense: "DUI", convictionDate: "not-a-date", isConviction: true }],
      [], NOW,
    );
    expect(r.decision).toBe("auto_deny");
  });
});
