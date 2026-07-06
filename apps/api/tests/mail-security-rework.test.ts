/**
 * Unit tests for the pure logic introduced by the mail/security rework:
 * outbound mailbox derivation, html→text stripping, and the brute-force
 * escalation threshold.
 *
 * Pure unit tests — no DB, no network.
 */
import { describe, it, expect } from "vitest";
import { mailboxFromAddress, htmlToPlainText } from "../src/lib/mailer";
import { shouldEscalateToBruteForce, BRUTE_FORCE_THRESHOLD } from "../src/lib/securityEvents";

describe("mailboxFromAddress", () => {
  it("extracts the local-part, lowercased", () => {
    expect(mailboxFromAddress("Security@getsweepr.com")).toBe("security");
    expect(mailboxFromAddress("it@getsweepr.com")).toBe("it");
    expect(mailboxFromAddress("caleb@getsweepr.com")).toBe("caleb");
  });

  it("returns null for empty/undefined/null input", () => {
    expect(mailboxFromAddress("")).toBeNull();
    expect(mailboxFromAddress(undefined)).toBeNull();
    expect(mailboxFromAddress(null)).toBeNull();
  });

  it("returns null when the local-part is empty (malformed address)", () => {
    expect(mailboxFromAddress("@getsweepr.com")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(mailboxFromAddress(" alerts @getsweepr.com".trim())).toBe("alerts");
  });
});

describe("htmlToPlainText", () => {
  it("converts <br> to newlines and </p> to paragraph breaks", () => {
    const out = htmlToPlainText("<p>Hello<br/>World</p><p>Second</p>");
    expect(out).toBe("Hello\nWorld\n\nSecond");
  });

  it("strips remaining tags", () => {
    expect(htmlToPlainText("<div><strong>Bold</strong> text</div>")).toBe("Bold text");
  });

  it("decodes common HTML entities", () => {
    expect(htmlToPlainText("Tom &amp; Jerry &lt;3&gt; &quot;fun&quot;")).toBe('Tom & Jerry <3> "fun"');
  });

  it("collapses runs of blank lines to at most one blank line", () => {
    const out = htmlToPlainText("<p>A</p><p></p><p></p><p>B</p>");
    expect(out).not.toMatch(/\n{3,}/);
  });
});

describe("shouldEscalateToBruteForce", () => {
  it("escalates only on the exact threshold count", () => {
    expect(BRUTE_FORCE_THRESHOLD).toBe(8);
    for (let count = 1; count < BRUTE_FORCE_THRESHOLD; count++) {
      expect(shouldEscalateToBruteForce(count)).toBe(false);
    }
    expect(shouldEscalateToBruteForce(BRUTE_FORCE_THRESHOLD)).toBe(true);
  });

  it("does not re-escalate on strikes after the threshold (avoids alert spam)", () => {
    expect(shouldEscalateToBruteForce(BRUTE_FORCE_THRESHOLD + 1)).toBe(false);
    expect(shouldEscalateToBruteForce(20)).toBe(false);
  });

  it("does not escalate on zero", () => {
    expect(shouldEscalateToBruteForce(0)).toBe(false);
  });
});
