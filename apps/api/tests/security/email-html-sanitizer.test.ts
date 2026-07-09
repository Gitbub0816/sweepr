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
 * sanitizeEmailHtml must strip event handlers regardless of the separator
 * before them and must not allow scriptable / SVG data: URLs. These cover the
 * bypasses fixed in the audit:
 *   - `<img/onerror=…>` (slash separator instead of whitespace)
 *   - unquoted `on*=` and `src=javascript:` values
 *   - `data:image/svg+xml` (SVG can carry script) while keeping raster data URIs
 */

import { describe, it, expect } from "vitest";
import { sanitizeEmailHtml } from "../../src/lib/emailHtml";

describe("sanitizeEmailHtml event-handler stripping", () => {
  it("strips a slash-separated onerror handler (<img/onerror=…>)", () => {
    const out = sanitizeEmailHtml(`<img/onerror="alert(1)" src="x">`);
    expect(out.toLowerCase()).not.toContain("onerror");
    expect(out.toLowerCase()).not.toContain("alert(1)");
  });

  it("strips whitespace-separated handlers", () => {
    const out = sanitizeEmailHtml(`<a href="https://x.com" onclick="steal()">hi</a>`);
    expect(out.toLowerCase()).not.toContain("onclick");
    expect(out.toLowerCase()).not.toContain("steal()");
  });

  it("strips unquoted handler values", () => {
    const out = sanitizeEmailHtml(`<div onmouseover=hack()>x</div>`);
    expect(out.toLowerCase()).not.toContain("onmouseover");
    expect(out.toLowerCase()).not.toContain("hack()");
  });
});

describe("sanitizeEmailHtml URL scheme filtering", () => {
  it("rejects data:image/svg+xml (script-capable)", () => {
    const svg = `data:image/svg+xml,<svg onload=alert(1)>`;
    const out = sanitizeEmailHtml(`<img src="${svg}">`);
    expect(out.toLowerCase()).not.toContain("svg+xml");
    expect(out.toLowerCase()).not.toContain("data:image/svg");
  });

  it("keeps a data:image/png inline image", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const out = sanitizeEmailHtml(`<img src="${png}">`);
    expect(out).toContain(png);
  });

  it("strips an unquoted javascript: src", () => {
    const out = sanitizeEmailHtml(`<img src=javascript:alert(1)>`);
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("keeps ordinary https links", () => {
    const out = sanitizeEmailHtml(`<a href="https://getsweepr.com/x">go</a>`);
    expect(out).toContain("https://getsweepr.com/x");
  });
});
