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
    // The quiz questions array is stored but not rendered — say so, so nobody
    // promises a human that quizzes grade cleaners today.
    expect(doc).toMatch(/`questions` \(object\[\]\) — NOT RENDERED YET/);
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
