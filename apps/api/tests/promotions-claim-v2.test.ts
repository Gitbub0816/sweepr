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
 * apps/api/src/lib/promotions.ts — claim eligibility must consider CTAs on
 * ANY page of a multi-page promotion (not just page one), resolve the
 * caller-named CTA by id when given, fall back to the entry page's default
 * claim-eligible CTA otherwise, and keep working unmodified for a
 * legacy (design_version 1) row via the normalizer.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Sql } from "../src/lib/db";
import { claimPromotion, resolvePromoDesign, type PromotionRow } from "../src/lib/promotions";
import type { PromoDesignV2 } from "@sweepr/utils";

const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
let handler: (text: string, values: unknown[]) => unknown = () => [];

function makeSql(): Sql {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    sqlCalls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  }) as unknown as Sql;
}

beforeEach(() => {
  sqlCalls.length = 0;
  handler = () => [];
});

const MULTI_PAGE_DESIGN: PromoDesignV2 = {
  version: 2,
  entryPageKey: "welcome",
  pages: [
    {
      key: "welcome",
      mode: "blocks",
      blocks: [{ type: "heading", text: "Welcome" }],
      // Entry page has NO claim-eligible CTA — only a page-jump and a dismiss.
      ctas: [
        { id: "cta-goto", label: "See the offer", action: "goto_page", targetPageKey: "offer" },
        { id: "cta-dismiss", label: "No thanks", action: "dismiss" },
      ],
    },
    {
      key: "offer",
      mode: "blocks",
      blocks: [{ type: "heading", text: "20% off" }],
      ctas: [
        { id: "cta-claim", label: "Claim it", action: "claim", requireField: "email", successMessage: "Claimed on the offer page!" },
        { id: "cta-news", label: "Just the newsletter", action: "newsletter", requireField: "email", successMessage: "Subscribed!" },
      ],
    },
  ],
};

function activePromoRow(overrides: Partial<PromotionRow> = {}): PromotionRow {
  return {
    id: "promo-1",
    slug: "multi-page-promo",
    name: "Multi-page promo",
    template_key: null,
    audience: "all",
    status: "active",
    design: MULTI_PAGE_DESIGN,
    cta: {} as PromotionRow["cta"],
    display: { placement: "modal" } as PromotionRow["display"],
    starts_at: null,
    expires_at: null,
    max_claims: null,
    claim_count: 0,
    view_count: 0,
    grants_founding_member: false,
    reward: {},
    design_version: 2,
    created_via: "console",
    ...overrides,
  };
}

function handlerFor(row: PromotionRow, opts: { claimInsertOk?: boolean } = {}) {
  const claimInsertOk = opts.claimInsertOk ?? true;
  return (text: string) => {
    if (text.includes("FROM promotions WHERE slug")) return [row];
    if (text.includes("INSERT INTO promotion_claims")) return claimInsertOk ? [{ id: "claim-1" }] : [];
    if (text.includes("UPDATE promotions") && text.includes("claim_count")) return [];
    if (text.includes("INSERT INTO newsletter_subscribers")) return [];
    if (text.includes("INSERT INTO waitlist")) return [];
    return [];
  };
}

describe("resolvePromoDesign — normalizes by design_version", () => {
  it("returns a v2 design unchanged", () => {
    const row = activePromoRow();
    expect(resolvePromoDesign(row)).toEqual(MULTI_PAGE_DESIGN);
  });

  it("upgrades a legacy row", () => {
    const row = activePromoRow({
      design_version: 1,
      design: { blocks: [{ type: "text", text: "hi" }] } as PromotionRow["design"],
      cta: { label: "Claim", action: "claim", requireField: "email" } as PromotionRow["cta"],
    });
    const v2 = resolvePromoDesign(row);
    expect(v2.version).toBe(2);
    expect(v2.pages).toHaveLength(1);
  });
});

describe("claimPromotion — multi-page CTA resolution", () => {
  it("resolves an explicitly-named CTA on a NON-entry page", async () => {
    const row = activePromoRow();
    handler = handlerFor(row);
    const sql = makeSql();
    const result = await claimPromotion(sql, row.slug, { email: "a@b.com", ctaId: "cta-claim" });
    expect(result.status).toBe("claimed");
    expect(result.message).toContain("Claimed on the offer page!");
  });

  it("enforces the NAMED CTA's requireField, not any other CTA's", async () => {
    const row = activePromoRow();
    handler = handlerFor(row);
    const sql = makeSql();
    // cta-claim requires email; omit it.
    const result = await claimPromotion(sql, row.slug, { ctaId: "cta-claim" });
    expect(result.status).toBe("invalid_field");
  });

  it("falls back to the entry page's default claim-eligible CTA when no ctaId is given — which, since the entry page has none, is the first claim-eligible CTA on a LATER page", async () => {
    const row = activePromoRow();
    handler = handlerFor(row);
    const sql = makeSql();
    const result = await claimPromotion(sql, row.slug, { email: "a@b.com" });
    expect(result.status).toBe("claimed");
    // Picked "cta-claim" (the first claim-eligible CTA in page order), not
    // "cta-news" — confirms ordering, not just "any claim-eligible CTA".
    expect(result.message).toContain("Claimed on the offer page!");
  });

  it("rejects a ctaId that doesn't exist anywhere in the design", async () => {
    const row = activePromoRow();
    handler = handlerFor(row);
    const sql = makeSql();
    const result = await claimPromotion(sql, row.slug, { email: "a@b.com", ctaId: "nope" });
    expect(result.status).toBe("invalid_field");
    expect(result.message).toContain("no claimable action");
  });

  it("routes a newsletter claim on the offer page into newsletter_subscribers", async () => {
    const row = activePromoRow();
    handler = handlerFor(row);
    const sql = makeSql();
    const result = await claimPromotion(sql, row.slug, { email: "a@b.com", ctaId: "cta-news" });
    expect(result.status).toBe("claimed");
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO newsletter_subscribers"))).toBe(true);
  });

  it("a promo that isn't live is never claimable regardless of ctaId", async () => {
    const row = activePromoRow({ status: "paused" });
    handler = handlerFor(row);
    const sql = makeSql();
    const result = await claimPromotion(sql, row.slug, { email: "a@b.com", ctaId: "cta-claim" });
    expect(result.status).toBe("not_live");
  });

  it("dedups per (promotion, email) via the unique-index insert failure path", async () => {
    const row = activePromoRow();
    handler = handlerFor(row, { claimInsertOk: false });
    const sql = makeSql();
    const result = await claimPromotion(sql, row.slug, { email: "a@b.com", ctaId: "cta-claim" });
    expect(result.status).toBe("already_claimed");
  });

  it("still works for a legacy (design_version 1) single-CTA promo with no ctaId at all", async () => {
    const row = activePromoRow({
      design_version: 1,
      design: { blocks: [{ type: "heading", text: "Old promo" }] } as PromotionRow["design"],
      cta: { label: "Claim", action: "claim", requireField: "email", successMessage: "Legacy claimed!" } as PromotionRow["cta"],
    });
    handler = handlerFor(row);
    const sql = makeSql();
    const result = await claimPromotion(sql, row.slug, { email: "a@b.com" });
    expect(result.status).toBe("claimed");
    expect(result.message).toContain("Legacy claimed!");
  });
});
