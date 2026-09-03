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
 * The Course Builder block schema — the single source of truth the admin
 * editor, the learner player, and apps/mcp's write validation all read.
 *
 * Two things are load-bearing here:
 *   1. The spec table stays in sync with COURSE_BLOCK_DEFAULTS, because the
 *      editor drops those defaults into real blocks — if a default used a
 *      key the spec doesn't allow, the MCP would reject a block the editor
 *      itself produces.
 *   2. courseText / courseChecklistItems never hand a non-string to a
 *      renderer. Blocks saved before validation existed can hold an object
 *      where a string belongs; rendering that raw throws React error #31 and
 *      blanks the learner's whole slide.
 */
import { describe, it, expect } from "vitest";
import {
  COURSE_BLOCK_DEFAULTS,
  COURSE_BLOCK_PROPS,
  COURSE_BLOCK_TYPES,
  courseChecklistItems,
  courseText,
  describeCourseBlockProps,
  validateCourseBlockProps,
} from "../src/courseSchema";

describe("the spec table and the editor's defaults agree", () => {
  it("every block type's defaults validate against its own spec", () => {
    for (const type of COURSE_BLOCK_TYPES) {
      expect(validateCourseBlockProps(type, COURSE_BLOCK_DEFAULTS[type].props)).toEqual([]);
    }
  });

  it("every block type has an entry in both tables", () => {
    for (const type of COURSE_BLOCK_TYPES) {
      expect(COURSE_BLOCK_PROPS[type]).toBeDefined();
      expect(COURSE_BLOCK_DEFAULTS[type]).toBeDefined();
    }
  });

  it("documents every block type, and marks the props nothing renders yet", () => {
    const doc = describeCourseBlockProps();
    for (const type of COURSE_BLOCK_TYPES) expect(doc).toContain(`**${type}**`);
    // Video gating is stored but not enforced — say so, so nobody promises a
    // human a watch-percentage gate that doesn't exist.
    expect(doc).toMatch(/`requireWatchPercent` \(number\) \[NOT RENDERED YET\]/);
    // Quiz questions are real now (graded server-side) — the doc must NOT
    // call them inert anymore, and must flag the answer key as never served.
    expect(doc).not.toMatch(/`questions`[^\n]*NOT RENDERED YET/);
    expect(doc).toContain("never receives the `correct` flags");
  });
});

describe("interactive block invariants (write-time, so a block always grades sensibly)", () => {
  it("true_false requires the answer key", () => {
    expect(validateCourseBlockProps("true_false", { statement: "S" })[0]).toContain("true_false.correct is required");
    expect(validateCourseBlockProps("true_false", { statement: "S", correct: false })).toEqual([]);
  });

  it("image_choice needs 2–6 options with at least one correct", () => {
    expect(validateCourseBlockProps("image_choice", { options: [{ url: "a" }] })[0]).toContain("2–6 options");
    expect(
      validateCourseBlockProps("image_choice", { options: [{ url: "a" }, { url: "b" }] })[0],
    ).toContain("no correct option");
  });

  it("sort items must point at real categories with unique ids", () => {
    const errs = validateCourseBlockProps("sort", {
      categories: ["A", "B"],
      items: [
        { id: "1", label: "x", category: "A" },
        { id: "1", label: "y", category: "C" },
      ],
    });
    expect(errs.join(" ")).toContain('"1" is duplicated');
    expect(errs.join(" ")).toContain('"C" is not one of');
  });

  it("order positions must be distinct; quiz single-select needs exactly one correct", () => {
    expect(
      validateCourseBlockProps("order", {
        items: [
          { id: "a", label: "x", correctOrder: 1 },
          { id: "b", label: "y", correctOrder: 1 },
        ],
      })[0],
    ).toContain("is duplicated");
    expect(
      validateCourseBlockProps("quiz", {
        questions: [
          { question: "Q", options: [{ text: "a", correct: true }, { text: "b", correct: true }] },
        ],
      })[0],
    ).toContain("set multi: true");
  });

  it("hotspot needs a correct region with percentage coordinates", () => {
    expect(validateCourseBlockProps("hotspot", { hotspots: [{ x: 1, y: 1, width: 5, height: 5 }] })[0]).toContain(
      "no correct region",
    );
    expect(
      validateCourseBlockProps("hotspot", { hotspots: [{ x: 150, y: 1, width: 5, height: 5, correct: true }] })[0],
    ).toContain("must be a percentage");
  });

  it("nested required item fields are enforced (quiz option text, scenario message text)", () => {
    expect(
      validateCourseBlockProps("quiz", { questions: [{ question: "Q", options: [{ correct: true }, { text: "b" }] }] }).join(" "),
    ).toContain("options[0].text is required");
    expect(validateCourseBlockProps("scenario", { messages: [{ speaker: "Customer" }], choices: [{ text: "a", correct: true }, { text: "b" }] }).join(" ")).toContain(
      "messages[0].text is required",
    );
  });

  it("style tokens are constrained enums, not arbitrary CSS", () => {
    expect(validateCourseBlockProps("callout", { style: { radius: "huge" } })[0]).toContain("must be one of: none, sm, md, lg, xl");
    expect(validateCourseBlockProps("callout", { style: { zIndex: 4 } })[0]).toContain('"zIndex" is not a valid key');
    expect(validateCourseBlockProps("callout", { style: { variant: "info", radius: "lg", padding: "md", icon: "checklist" } })).toEqual([]);
  });
});

describe("props.i18n locale overlays", () => {
  it("accepts a scalar translation of a localizable prop", () => {
    expect(
      validateCourseBlockProps("text", { content: "Welcome", i18n: { es: { content: "Bienvenido" } } }),
    ).toEqual([]);
  });

  it("rejects unknown locales, non-localizable props, and length mismatches", () => {
    expect(validateCourseBlockProps("text", { i18n: { klingon: { content: "x" } } })[0]).toContain("unknown locale");
    expect(validateCourseBlockProps("text", { size: 20, i18n: { es: { size: 22 } } })[0]).toContain("not localizable");
    expect(
      validateCourseBlockProps("checklist", { items: ["a", "b"], i18n: { es: { items: ["uno"] } } })[0],
    ).toContain("same number of entries");
  });

  it("structured overlays may translate text fields but never answer keys", () => {
    const base = {
      categories: ["Included", "Add-On"],
      items: [
        { id: "1", label: "Vacuum", category: "Included" },
        { id: "2", label: "Oven", category: "Add-On" },
      ],
    };
    expect(
      validateCourseBlockProps("sort", {
        ...base,
        i18n: { es: { items: [{ label: "Aspirar" }, { label: "Horno" }] } },
      }),
    ).toEqual([]);
    expect(
      validateCourseBlockProps("sort", {
        ...base,
        i18n: { es: { items: [{ category: "Incluido" }, { label: "Horno" }] } },
      })[0],
    ).toContain("not localizable");
  });
});

describe("validateCourseBlockProps", () => {
  it("accepts an empty props object (every prop is optional)", () => {
    expect(validateCourseBlockProps("text", {})).toEqual([]);
  });

  it("rejects an unknown prop key and lists what is allowed", () => {
    const [err] = validateCourseBlockProps("text", { text: "hi" });
    expect(err).toContain('"text" is not a prop of a text block');
    expect(err).toContain("content");
  });

  it("rejects checklist items given as objects, with a fix in the message", () => {
    const [err] = validateCourseBlockProps("checklist", { items: [{ text: "a" }] });
    expect(err).toContain("must be an array of plain strings");
    expect(err).toContain('objects like {text: "…"} are not accepted');
  });

  it("rejects wrong value types and out-of-set enum values", () => {
    expect(validateCourseBlockProps("text", { size: "20px" })).toEqual(["text.size must be a number"]);
    expect(validateCourseBlockProps("text", { italic: "yes" })).toEqual(["text.italic must be a boolean"]);
    expect(validateCourseBlockProps("shape", { shape: "triangle" })[0]).toContain("must be one of: rect, ellipse, line");
  });

  it("treats null/undefined as 'use the default' rather than an error", () => {
    expect(validateCourseBlockProps("text", { content: null, size: undefined })).toEqual([]);
  });

  it("rejects an unknown block type and non-object props", () => {
    expect(validateCourseBlockProps("marquee", {})[0]).toContain('unknown block_type "marquee"');
    expect(validateCourseBlockProps("text", ["nope"])).toEqual(["props must be an object"]);
    expect(validateCourseBlockProps("text", null)).toEqual(["props must be an object"]);
  });

  it("reports every problem in one pass, not just the first", () => {
    expect(validateCourseBlockProps("callout", { variant: "danger", body: 42, nope: 1 })).toHaveLength(3);
  });
});

describe("render coercion keeps malformed stored props from crashing a slide", () => {
  it("passes strings and numbers through", () => {
    expect(courseText("hello")).toBe("hello");
    expect(courseText(12)).toBe("12");
  });

  it("unwraps the object shapes an LLM invents instead of returning the object", () => {
    expect(courseText({ text: "from text" })).toBe("from text");
    expect(courseText({ label: "from label" })).toBe("from label");
    expect(courseText({ content: "from content" })).toBe("from content");
  });

  it("never returns a non-string, whatever it is handed", () => {
    for (const junk of [null, undefined, {}, [], true, NaN, { nested: { deep: 1 } }]) {
      expect(typeof courseText(junk)).toBe("string");
    }
  });

  it("coerces the exact checklist shape that crashed the player", () => {
    expect(courseChecklistItems([{ text: "Ring the bell" }, { text: "Photos" }])).toEqual([
      "Ring the bell",
      "Photos",
    ]);
    expect(courseChecklistItems(["already", "fine"])).toEqual(["already", "fine"]);
    expect(courseChecklistItems("not an array")).toEqual([]);
    expect(courseChecklistItems([{ unrenderable: true }, "kept"])).toEqual(["kept"]);
  });
});
