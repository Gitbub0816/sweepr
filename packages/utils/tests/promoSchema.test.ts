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
import {
  normalizeLegacyPromoDesign,
  toPromoDesignV2,
  collectAllCtas,
  collectPageKeys,
  findCtaById,
  defaultClaimCta,
  validatePromoDesignV2Structure,
  promoCodeByteSize,
  PROMO_MAX_PAGES,
  PROMO_MAX_CTAS_PER_PAGE,
  PROMO_CODE_MAX_BYTES,
  PROMO_DEFAULT_PAGE_KEY,
  type PromoDesignV2,
  type PromoPageV2,
} from "../src/promoSchema";

function minimalPage(overrides: Partial<PromoPageV2> = {}): PromoPageV2 {
  return {
    key: "page-1",
    mode: "blocks",
    blocks: [{ type: "heading", text: "Hi", align: "center" }],
    ctas: [{ id: "cta-1", label: "Claim", action: "claim", requireField: "email", style: "primary" }],
    ...overrides,
  };
}
function minimalDesign(pages: PromoPageV2[] = [minimalPage()]): PromoDesignV2 {
  return { version: 2, entryPageKey: pages[0].key, pages };
}

describe("normalizeLegacyPromoDesign — upgrading a design_version 1 row", () => {
  it("wraps blocks + a single CTA into one page", () => {
    const v2 = normalizeLegacyPromoDesign(
      { theme: "brand", accent: "#0f766e", blocks: [{ type: "heading", text: "Hello" }] },
      { label: "Claim now", action: "claim", requireField: "email", successMessage: "Done!" },
    );
    expect(v2.version).toBe(2);
    expect(v2.pages).toHaveLength(1);
    expect(v2.entryPageKey).toBe(PROMO_DEFAULT_PAGE_KEY);
    expect(v2.pages[0].mode).toBe("blocks");
    expect(v2.pages[0].blocks?.[0].text).toBe("Hello");
    expect(v2.pages[0].ctas).toHaveLength(1);
    expect(v2.pages[0].ctas[0]).toMatchObject({ label: "Claim now", action: "claim", requireField: "email" });
  });

  it("converts a legacy secondary link button into a second CTA", () => {
    const v2 = normalizeLegacyPromoDesign(
      { blocks: [] },
      { label: "Claim", action: "claim", secondary: { label: "No thanks", url: "https://getsweepr.com/" } },
    );
    expect(v2.pages[0].ctas).toHaveLength(2);
    expect(v2.pages[0].ctas[1]).toMatchObject({ label: "No thanks", action: "link", url: "https://getsweepr.com/", style: "secondary" });
  });

  it("infers canvas mode when the legacy design has canvas elements", () => {
    const v2 = normalizeLegacyPromoDesign(
      {
        blocks: [{ type: "text", text: "unused" }],
        canvas: { aspect: "1:1", elements: [{ id: "el-1", type: "text", x: 0, y: 0, w: 50, h: 10, text: "Hi" }] },
      },
      { label: "Claim", action: "claim" },
    );
    expect(v2.pages[0].mode).toBe("canvas");
    expect(v2.pages[0].canvas?.elements).toHaveLength(1);
  });

  it("infers poster mode over blocks when a poster image is set", () => {
    const v2 = normalizeLegacyPromoDesign(
      { blocks: [{ type: "text", text: "unused" }], poster: { src: "https://x/img.png", hotspots: [{ x: 0, y: 0, w: 10, h: 10, cta: { label: "Go", action: "link", url: "https://x" } }] } },
      { label: "Claim", action: "claim" },
    );
    expect(v2.pages[0].mode).toBe("poster");
    expect(v2.pages[0].poster?.hotspots).toHaveLength(1);
    expect(v2.pages[0].poster?.hotspots?.[0].cta.action).toBe("link");
  });

  it("is total — never throws on empty/malformed input", () => {
    expect(() => normalizeLegacyPromoDesign(null, null)).not.toThrow();
    expect(() => normalizeLegacyPromoDesign(undefined, undefined)).not.toThrow();
    const v2 = normalizeLegacyPromoDesign({}, {} as never);
    expect(v2.pages).toHaveLength(1);
  });
});

describe("toPromoDesignV2 — shape dispatch by design_version", () => {
  it("passes an already-v2 design through untouched", () => {
    const design = minimalDesign();
    const out = toPromoDesignV2(design, {}, 2);
    expect(out).toEqual(design);
  });

  it("upgrades a design_version 1 row even if the JSON happens to look v2-ish but isn't stamped", () => {
    const out = toPromoDesignV2({ blocks: [] }, { label: "Claim", action: "claim" }, 1);
    expect(out.version).toBe(2);
  });

  it("fails safe into the upgrade path for an unexpected design_version value", () => {
    const out = toPromoDesignV2({ blocks: [] }, { label: "Claim", action: "claim" }, 99);
    expect(out.version).toBe(2);
  });
});

describe("collectAllCtas / collectPageKeys / findCtaById", () => {
  const design = minimalDesign([
    minimalPage({
      key: "page-1",
      ctas: [{ id: "cta-1", label: "Claim", action: "claim", requireField: "email" }],
      canvas: { elements: [{ id: "el-1", type: "button", x: 0, y: 0, w: 10, h: 10, cta: { id: "canvas-cta", label: "Buy", action: "link", url: "https://x" } }] },
    }),
    minimalPage({ key: "page-2", ctas: [{ id: "cta-2", label: "Dismiss", action: "dismiss" }] }),
  ]);

  it("collects CTAs from page.ctas AND embedded canvas/poster CTAs", () => {
    const all = collectAllCtas(design);
    expect(all.map((c) => c.id).sort()).toEqual(["canvas-cta", "cta-1", "cta-2"]);
  });

  it("collects every page key", () => {
    expect(collectPageKeys(design)).toEqual(["page-1", "page-2"]);
  });

  it("finds a CTA by id anywhere in the design, including embedded ones", () => {
    expect(findCtaById(design, "cta-2")?.page.key).toBe("page-2");
    expect(findCtaById(design, "canvas-cta")?.page.key).toBe("page-1");
    expect(findCtaById(design, "nope")).toBeNull();
  });
});

describe("defaultClaimCta — claim eligibility across ANY page", () => {
  it("prefers a claim-eligible CTA on the entry page", () => {
    const design = minimalDesign([minimalPage({ key: "page-1", ctas: [{ id: "cta-1", label: "Claim", action: "claim" }] })]);
    expect(defaultClaimCta(design)?.cta.id).toBe("cta-1");
  });

  it("falls through to a claim-eligible CTA on a LATER page when the entry page has none", () => {
    const design: PromoDesignV2 = {
      version: 2,
      entryPageKey: "page-1",
      pages: [
        minimalPage({ key: "page-1", ctas: [{ id: "cta-1", label: "Dismiss", action: "dismiss" }] }),
        minimalPage({ key: "page-2", ctas: [{ id: "cta-2", label: "Claim", action: "newsletter", requireField: "email" }] }),
      ],
    };
    expect(defaultClaimCta(design)?.cta.id).toBe("cta-2");
  });

  it("returns null for a design with no CTAs anywhere", () => {
    const design = minimalDesign([minimalPage({ ctas: [] })]);
    expect(defaultClaimCta(design)).toBeNull();
  });
});

describe("validatePromoDesignV2Structure", () => {
  it("accepts a minimal valid design with no errors", () => {
    expect(validatePromoDesignV2Structure(minimalDesign())).toEqual([]);
  });

  it("rejects more than PROMO_MAX_PAGES pages", () => {
    const pages = Array.from({ length: PROMO_MAX_PAGES + 1 }, (_, i) => minimalPage({ key: `page-${i}` }));
    const design = minimalDesign(pages);
    expect(validatePromoDesignV2Structure(design).some((e) => e.includes("at most"))).toBe(true);
  });

  it("rejects more than PROMO_MAX_CTAS_PER_PAGE CTAs on one page", () => {
    const ctas = Array.from({ length: PROMO_MAX_CTAS_PER_PAGE + 1 }, (_, i) => ({
      id: `cta-${i}`, label: "x", action: "dismiss" as const,
    }));
    const design = minimalDesign([minimalPage({ ctas })]);
    expect(validatePromoDesignV2Structure(design).some((e) => e.includes("more than"))).toBe(true);
  });

  it("rejects duplicate page keys", () => {
    const design = minimalDesign([minimalPage({ key: "dup" }), minimalPage({ key: "dup" })]);
    expect(validatePromoDesignV2Structure(design).some((e) => e.includes("Duplicate page key"))).toBe(true);
  });

  it("rejects an entryPageKey that doesn't match any page", () => {
    const design = { ...minimalDesign(), entryPageKey: "missing" };
    expect(validatePromoDesignV2Structure(design).some((e) => e.includes("entryPageKey"))).toBe(true);
  });

  it("rejects a goto_page CTA with no targetPageKey", () => {
    const design = minimalDesign([minimalPage({ ctas: [{ id: "cta-1", label: "Next", action: "goto_page" }] })]);
    expect(validatePromoDesignV2Structure(design).some((e) => e.includes("goto_page but no targetPageKey"))).toBe(true);
  });

  it("rejects a goto_page CTA whose target isn't a real page", () => {
    const design = minimalDesign([minimalPage({ ctas: [{ id: "cta-1", label: "Next", action: "goto_page", targetPageKey: "nowhere" }] })]);
    expect(validatePromoDesignV2Structure(design).some((e) => e.includes("does not exist on this promotion"))).toBe(true);
  });

  it("accepts a goto_page CTA whose target IS a real page", () => {
    const design = minimalDesign([
      minimalPage({ key: "a", ctas: [{ id: "cta-1", label: "Next", action: "goto_page", targetPageKey: "b" }] }),
      minimalPage({ key: "b", ctas: [] }),
    ]);
    expect(validatePromoDesignV2Structure(design)).toEqual([]);
  });

  it("rejects a link CTA with no url", () => {
    const design = minimalDesign([minimalPage({ ctas: [{ id: "cta-1", label: "Go", action: "link" }] })]);
    expect(validatePromoDesignV2Structure(design).some((e) => e.includes("action=link but no url"))).toBe(true);
  });

  it("rejects newsletter/waitlist CTAs that don't require email", () => {
    const design = minimalDesign([
      minimalPage({ ctas: [{ id: "cta-1", label: "Subscribe", action: "newsletter", requireField: "phone" }] }),
    ]);
    const errors = validatePromoDesignV2Structure(design);
    expect(errors.some((e) => e.includes('requires requireField="email"'))).toBe(true);
  });

  it("accepts a newsletter CTA that DOES require email", () => {
    const design = minimalDesign([
      minimalPage({ ctas: [{ id: "cta-1", label: "Subscribe", action: "newsletter", requireField: "email" }] }),
    ]);
    expect(validatePromoDesignV2Structure(design)).toEqual([]);
  });

  it("rejects a code-mode page whose html+css+js exceeds PROMO_CODE_MAX_BYTES", () => {
    const bigHtml = "x".repeat(PROMO_CODE_MAX_BYTES + 1);
    const design = minimalDesign([
      minimalPage({ mode: "code", code: { html: bigHtml }, blocks: undefined }),
    ]);
    const errors = validatePromoDesignV2Structure(design);
    expect(errors.some((e) => e.includes("over the"))).toBe(true);
  });

  it("accepts a code-mode page within the byte cap", () => {
    const design = minimalDesign([
      minimalPage({ mode: "code", code: { html: "<div>hi</div>", css: "div{color:red}", js: "console.log(1)" }, blocks: undefined }),
    ]);
    expect(validatePromoDesignV2Structure(design)).toEqual([]);
  });

  it("rejects a poster-mode page with no image", () => {
    const design = minimalDesign([minimalPage({ mode: "poster", blocks: undefined })]);
    expect(validatePromoDesignV2Structure(design).some((e) => e.includes("poster mode but has no image"))).toBe(true);
  });

  it("rejects a canvas-mode page with no elements", () => {
    const design = minimalDesign([minimalPage({ mode: "canvas", blocks: undefined })]);
    expect(validatePromoDesignV2Structure(design).some((e) => e.includes("canvas mode but has no elements"))).toBe(true);
  });
});

describe("promoCodeByteSize", () => {
  it("counts UTF-8 bytes, not UTF-16 code units", () => {
    // "🎁" is 1 UTF-16 code unit pair (length 2) but 4 UTF-8 bytes.
    expect(promoCodeByteSize({ html: "🎁" })).toBe(4);
    expect(promoCodeByteSize({ html: "abc", css: "def", js: "ghi" })).toBe(9);
    expect(promoCodeByteSize({ html: "" })).toBe(0);
  });
});
