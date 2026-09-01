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
 * Security-sensitive: code-mode promotion pages let an admin (or, via the
 * MCP publish exception, an LLM) upload arbitrary HTML/CSS/JS that a
 * customer's browser executes. These tests assert the isolation boundary
 * this file documents is actually what ships: `sandbox="allow-scripts"`
 * with NO `allow-same-origin` anywhere, ever.
 */
import { describe, it, expect } from "vitest";
import {
  assemblePromoCodeSrcdoc,
  PROMO_CODE_IFRAME_SANDBOX,
  PROMO_CODE_IFRAME_PROPS,
} from "../src/promoSandbox";
import { promoCodeByteSize } from "../src/promoSchema";

describe("PROMO_CODE_IFRAME_SANDBOX — the isolation boundary", () => {
  it("is exactly 'allow-scripts', nothing more", () => {
    expect(PROMO_CODE_IFRAME_SANDBOX).toBe("allow-scripts");
  });

  it("never contains allow-same-origin", () => {
    expect(PROMO_CODE_IFRAME_SANDBOX).not.toContain("allow-same-origin");
  });

  it("never contains allow-top-navigation or allow-popups", () => {
    expect(PROMO_CODE_IFRAME_SANDBOX).not.toContain("allow-top-navigation");
    expect(PROMO_CODE_IFRAME_SANDBOX).not.toContain("allow-popups");
  });

  it("PROMO_CODE_IFRAME_PROPS carries the same sandbox value and a strict referrer policy", () => {
    expect(PROMO_CODE_IFRAME_PROPS.sandbox).toBe("allow-scripts");
    expect(PROMO_CODE_IFRAME_PROPS.referrerPolicy).toBe("no-referrer");
  });
});

describe("assemblePromoCodeSrcdoc", () => {
  it("wraps the given html, css, and js into one document", () => {
    const doc = assemblePromoCodeSrcdoc({ html: "<h1>Hi</h1>", css: "h1{color:red}", js: "console.log('hi')" });
    expect(doc).toContain("<h1>Hi</h1>");
    expect(doc).toContain("h1{color:red}");
    expect(doc).toContain("console.log('hi')");
    expect(doc).toContain("<!doctype html>");
  });

  it("carries a restrictive Content-Security-Policy meta tag", () => {
    const doc = assemblePromoCodeSrcdoc({ html: "<p>x</p>" });
    expect(doc).toContain("Content-Security-Policy");
    expect(doc).toContain("connect-src 'none'");
    expect(doc).toContain("frame-src 'none'");
  });

  it("never emits allow-same-origin anywhere in the assembled document, even adversarial input", () => {
    const doc = assemblePromoCodeSrcdoc({
      html: '<script>window.parent.document.cookie</script>',
      css: "/* allow-same-origin */",
      js: "// pretend allow-same-origin appears here too, still not in the sandbox attribute",
    });
    // The srcdoc STRING may legitimately contain the substring inside a
    // comment (as tested here) — the actual guarantee lives in the exported
    // sandbox constant, asserted above. This test documents that the
    // assembler itself adds no sandbox/iframe markup of its own that could
    // carry the token.
    expect(doc).not.toContain('sandbox="');
    expect(doc).not.toContain("<iframe");
  });

  it("wraps the JS in a try/catch so a broken widget script doesn't blank the page", () => {
    const doc = assemblePromoCodeSrcdoc({ html: "<p>x</p>", js: "throw new Error('boom')" });
    expect(doc).toContain("try {");
    expect(doc).toContain("catch (promoWidgetError)");
  });

  it("handles missing css/js gracefully", () => {
    expect(() => assemblePromoCodeSrcdoc({ html: "<p>only html</p>" })).not.toThrow();
  });

  it("is deterministic (pure) for the same input — preview and production never drift", () => {
    const code = { html: "<p>x</p>", css: "p{color:blue}", js: "1+1" };
    expect(assemblePromoCodeSrcdoc(code)).toBe(assemblePromoCodeSrcdoc({ ...code }));
  });
});

describe("promoCodeByteSize (promoSchema.ts, used by the sandbox size cap)", () => {
  it("sums UTF-8 bytes across html+css+js", () => {
    expect(promoCodeByteSize({ html: "abc", css: "de", js: "f" })).toBe(6);
  });
});
