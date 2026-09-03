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
 * The interactive layer's server-authoritative helpers: localization merge,
 * learner sanitization (answers must NEVER survive into the served payload),
 * and grading (which must agree with the shapes the sanitizer served —
 * including the deterministic shuffles keyed on the block id).
 */
import { describe, it, expect } from "vitest";
import {
  coursePermutation,
  courseFeedbackFor,
  gradeCourseBlock,
  localizeCourseBlockProps,
  sanitizeCourseBlockPropsForLearner,
  validateCourseAssessmentSettings,
} from "../src/courseInteractions";

const BLOCK_ID = "3e0e4d5f-6a7b-4c8d-9e0f-112233445566";

describe("localizeCourseBlockProps", () => {
  it("merges a scalar overlay and drops the i18n bundle", () => {
    const out = localizeCourseBlockProps(
      { content: "Welcome", size: 20, i18n: { es: { content: "Bienvenido" } } },
      "es",
    );
    expect(out).toEqual({ content: "Bienvenido", size: 20 });
  });

  it("merges structured overlays element-wise, keeping ids and answer keys", () => {
    const out = localizeCourseBlockProps(
      {
        items: [
          { id: "1", label: "Vacuum", category: "Included" },
          { id: "2", label: "Oven", category: "Add-On" },
        ],
        i18n: { es: { items: [{ label: "Aspirar" }, { label: "Horno" }] } },
      },
      "es",
    );
    expect(out.items).toEqual([
      { id: "1", label: "Aspirar", category: "Included" },
      { id: "2", label: "Horno", category: "Add-On" },
    ]);
  });

  it("returns base content for the default locale or a locale with no overlay", () => {
    const props = { content: "Welcome", i18n: { es: { content: "Bienvenido" } } };
    expect(localizeCourseBlockProps(props, "en")).toEqual({ content: "Welcome" });
    expect(localizeCourseBlockProps(props, undefined)).toEqual({ content: "Welcome" });
  });
});

describe("sanitizeCourseBlockPropsForLearner never leaks an answer", () => {
  it("strips every answer key and feedback string across the gradeable types", () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["true_false", { statement: "S", correct: true, correctFeedback: "yes", incorrectFeedback: "no", explanation: "E" }],
      ["image_choice", { question: "Q", options: [{ url: "a", label: "A", correct: true }, { url: "b", label: "B", correct: false }] }],
      ["sort", { categories: ["A", "B"], items: [{ id: "1", label: "x", category: "A" }, { id: "2", label: "y", category: "B" }] }],
      ["order", { items: [{ id: "a", label: "first", correctOrder: 1 }, { id: "b", label: "second", correctOrder: 2 }] }],
      ["matching", { pairs: [{ left: "L1", right: "R1" }, { left: "L2", right: "R2" }] }],
      ["hotspot", { url: "img", hotspots: [{ x: 10, y: 10, width: 5, height: 5, correct: true, label: "spot" }] }],
      ["scenario", { messages: [{ speaker: "C", text: "hi" }], choices: [{ text: "good", correct: true, feedback: "F" }, { text: "bad", correct: false }] }],
      ["quiz", { questions: [{ question: "Q", options: [{ text: "right", correct: true }, { text: "wrong", correct: false }] }] }],
    ];
    for (const [type, props] of cases) {
      const sanitized = JSON.stringify(sanitizeCourseBlockPropsForLearner(type, props, BLOCK_ID));
      expect(sanitized, type).not.toContain("correct");
      expect(sanitized, type).not.toContain("Feedback");
      expect(sanitized, type).not.toContain("explanation");
      expect(sanitized, type).not.toContain("correctOrder");
    }
  });

  it("sort/order items lose their category/position and are served shuffled deterministically", () => {
    const props = {
      items: [
        { id: "a", label: "first", correctOrder: 1 },
        { id: "b", label: "second", correctOrder: 2 },
        { id: "c", label: "third", correctOrder: 3 },
      ],
    };
    const one = sanitizeCourseBlockPropsForLearner("order", props, BLOCK_ID);
    const two = sanitizeCourseBlockPropsForLearner("order", props, BLOCK_ID);
    expect(one).toEqual(two); // stable across requests
    expect((one.items as Array<{ id: string }>).map((i) => i.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("hotspot regions become just a target count; matching becomes two columns", () => {
    const hs = sanitizeCourseBlockPropsForLearner(
      "hotspot",
      { url: "img", hotspots: [{ x: 1, y: 1, width: 5, height: 5, correct: true }, { x: 50, y: 50, width: 5, height: 5, correct: true }] },
      BLOCK_ID,
    );
    expect(hs.hotspots).toBeUndefined();
    expect(hs.targetCount).toBe(2);

    const m = sanitizeCourseBlockPropsForLearner(
      "matching",
      { pairs: [{ left: "L1", right: "R1" }, { left: "L2", right: "R2" }, { left: "L3", right: "R3" }] },
      BLOCK_ID,
    );
    expect(m.pairs).toBeUndefined();
    expect((m.left as unknown[]).length).toBe(3);
    expect((m.right as unknown[]).length).toBe(3);
  });
});

describe("gradeCourseBlock agrees with the served shapes", () => {
  it("true_false / image_choice / scenario grade single selections", () => {
    expect(gradeCourseBlock("true_false", { correct: false }, { answer: false }, BLOCK_ID)?.correct).toBe(true);
    expect(gradeCourseBlock("true_false", { correct: false }, { answer: true }, BLOCK_ID)?.correct).toBe(false);
    const ic = { options: [{ url: "a", correct: false }, { url: "b", correct: true }] };
    expect(gradeCourseBlock("image_choice", ic, { selected: 1 }, BLOCK_ID)?.correct).toBe(true);
    const sc = { choices: [{ text: "good", correct: true }, { text: "bad", correct: false, feedback: "Not quite" }] };
    const wrong = gradeCourseBlock("scenario", sc, { choice: 1 }, BLOCK_ID);
    expect(wrong?.correct).toBe(false);
    expect(wrong?.detail?.choiceFeedback).toBe("Not quite");
  });

  it("quiz grades per question with partial credit against its passingScore", () => {
    const props = {
      passingScore: 50,
      questions: [
        { question: "Q1", options: [{ text: "a", correct: true }, { text: "b" }] },
        { question: "Q2", multi: true, options: [{ text: "a", correct: true }, { text: "b", correct: true }, { text: "c" }] },
      ],
    };
    const half = gradeCourseBlock("quiz", props, { answers: [[0], [0]] }, BLOCK_ID);
    expect(half?.scorePct).toBe(50);
    expect(half?.correct).toBe(true); // passingScore 50
    expect(half?.detail?.perQuestion).toEqual([true, false]);
    const full = gradeCourseBlock("quiz", props, { answers: [[0], [0, 1]] }, BLOCK_ID);
    expect(full?.correct).toBe(true);
    expect(full?.scorePct).toBe(100);
  });

  it("sort and order grade placements/sequences by id", () => {
    const sort = {
      categories: ["A", "B"],
      items: [
        { id: "1", label: "x", category: "A" },
        { id: "2", label: "y", category: "B" },
      ],
    };
    expect(
      gradeCourseBlock("sort", sort, { placements: [{ id: "1", category: "A" }, { id: "2", category: "B" }] }, BLOCK_ID)?.correct,
    ).toBe(true);
    expect(
      gradeCourseBlock("sort", sort, { placements: [{ id: "1", category: "B" }, { id: "2", category: "B" }] }, BLOCK_ID)?.scorePct,
    ).toBe(50);

    const order = {
      items: [
        { id: "a", label: "first", correctOrder: 1 },
        { id: "b", label: "second", correctOrder: 2 },
      ],
    };
    expect(gradeCourseBlock("order", order, { order: ["a", "b"] }, BLOCK_ID)?.correct).toBe(true);
    expect(gradeCourseBlock("order", order, { order: ["b", "a"] }, BLOCK_ID)?.correct).toBe(false);
  });

  it("matching inverts the exact shuffle the sanitizer served", () => {
    const props = { pairs: [{ left: "L1", right: "R1" }, { left: "L2", right: "R2" }, { left: "L3", right: "R3" }] };
    const served = sanitizeCourseBlockPropsForLearner("matching", props, BLOCK_ID);
    const right = served.right as Array<{ id: string; label: string }>;
    // Build the correct answer from the served labels: match L_i with the
    // served right whose label is R_i.
    const matches = (["R1", "R2", "R3"] as const).map((label, i) => ({
      left: `l${i}`,
      right: right.find((r) => r.label === label)!.id,
    }));
    expect(gradeCourseBlock("matching", props, { matches }, BLOCK_ID)?.correct).toBe(true);
    // Pairing everything with the first right column entry is wrong.
    const wrong = matches.map((m) => ({ ...m, right: right[0].id }));
    expect(gradeCourseBlock("matching", props, { matches: wrong }, BLOCK_ID)?.correct).toBe(false);
  });

  it("hotspot requires every correct region found and no stray taps", () => {
    const props = {
      hotspots: [
        { x: 10, y: 10, width: 10, height: 10, correct: true, label: "sink" },
        { x: 70, y: 70, width: 10, height: 10, correct: true, label: "floor" },
      ],
    };
    const good = gradeCourseBlock("hotspot", props, { taps: [{ x: 15, y: 15 }, { x: 75, y: 75 }] }, BLOCK_ID);
    expect(good?.correct).toBe(true);
    expect(good?.detail?.foundLabels).toEqual(["sink", "floor"]);
    const missed = gradeCourseBlock("hotspot", props, { taps: [{ x: 15, y: 15 }] }, BLOCK_ID);
    expect(missed?.correct).toBe(false);
    expect(missed?.detail?.found).toBe(1);
    const stray = gradeCourseBlock("hotspot", props, { taps: [{ x: 15, y: 15 }, { x: 75, y: 75 }, { x: 40, y: 40 }] }, BLOCK_ID);
    expect(stray?.correct).toBe(false);
    expect(stray?.detail?.stray).toBe(1);
  });

  it("returns null for malformed responses (the API turns that into a 400)", () => {
    expect(gradeCourseBlock("true_false", { correct: true }, { answer: "yes" }, BLOCK_ID)).toBeNull();
    expect(gradeCourseBlock("image_choice", { options: [{ url: "a", correct: true }, { url: "b" }] }, { selected: 9 }, BLOCK_ID)).toBeNull();
    expect(gradeCourseBlock("quiz", { questions: [{ question: "Q", options: [{ text: "a", correct: true }, { text: "b" }] }] }, { answers: [] }, BLOCK_ID)).toBeNull();
    expect(gradeCourseBlock("text", {}, { anything: 1 }, BLOCK_ID)).toBeNull();
  });

  it("permutations are deterministic per seed and cover all indexes", () => {
    const a = coursePermutation(8, "seed-1");
    const b = coursePermutation(8, "seed-1");
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("assessment settings + feedback selection", () => {
  it("validates settings keys, ranges and types", () => {
    expect(validateCourseAssessmentSettings({ passingScorePct: 80, maxAttempts: 3, shuffleAnswers: true })).toEqual([]);
    expect(validateCourseAssessmentSettings({ passingScorePct: 0 })[0]).toContain("between 1 and 100");
    expect(validateCourseAssessmentSettings({ maxAttempts: 2.5 })[0]).toContain("positive integer");
    expect(validateCourseAssessmentSettings({ retakeDelay: 1 })[0]).toContain("not an assessment setting");
  });

  it("picks the matching feedback string for the verdict", () => {
    const props = { correctFeedback: "Nice", incorrectFeedback: "Look again", explanation: "Because." };
    expect(courseFeedbackFor(props, true)).toEqual({ feedback: "Nice", explanation: "Because." });
    expect(courseFeedbackFor(props, false)).toEqual({ feedback: "Look again", explanation: "Because." });
  });
});
