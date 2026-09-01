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
 * apps/mcp's promotions tool surface — the ONE deliberate exception where
 * this MCP worker writes live data. These tests cover:
 *   - list_promotions / get_promotion / preview_promotion are read-only
 *   - save_promotion_draft only ever writes status='draft' rows, and
 *     refuses to touch a promotion that isn't currently a draft
 *   - the mirrored zod schema enforces the SAME limits as the admin console
 *     (page count, CTA count, code-mode byte cap, goto_page targets,
 *     requireField sanity)
 *   - publish_promotion is REJECTED without a passing admin re-verification
 *     (verifyAdminForPromotions), even though the caller already holds a
 *     valid MCP session token
 *   - a successful publish_promotion writes BOTH the generic mcp_action_log
 *     entry (via protocol.ts, not exercised here) and a domain
 *     admin_audit_log row with action promotion.published_via_mcp
 */
import { describe, it, expect } from "vitest";
import {
  PROMO_MAX_PAGES,
  PROMO_MAX_CTAS_PER_PAGE,
  PROMO_CODE_MAX_BYTES,
  type PromoDesignV2,
  type PromoPageV2,
} from "@sweepr/utils";
import { callTool, TOOL_DEFS, ToolError, type ToolContext } from "../src/mcp/tools";
import { PROMOTION_TOOL_NAMES } from "../src/mcp/promotionTools";
import type { Sql } from "../src/lib/db";
import type { Env } from "../src/types";

const ENV: Env = {
  MCP_ENABLED: "true",
  DATABASE_URL: "postgres://unused",
  CLERK_ADMIN_SECRET_KEY: "sk_test_unused",
  MCP_TOKEN_SECRET: "test-secret",
};

const OWNER_EMAIL = "1morecruise@gmail.com"; // matches adminAuth.ts's FALLBACK_OWNER_EMAILS
const NON_ADMIN_EMAIL = "rando@getsweepr.com";

function ctxWith(
  handler: (text: string, values: unknown[]) => unknown,
  adminEmail = OWNER_EMAIL,
): { ctx: ToolContext; calls: Array<{ text: string; values: unknown[] }> } {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  }) as unknown as Sql;
  return { ctx: { sql, env: ENV, adminEmail }, calls };
}

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

describe("promotion tools are registered in the merged TOOL_DEFS", () => {
  it("lists all five promotion tools", () => {
    const names = TOOL_DEFS.map((t) => t.name);
    for (const n of PROMOTION_TOOL_NAMES) expect(names).toContain(n);
  });
});

describe("list_promotions / get_promotion — read-only", () => {
  it("list_promotions never writes", async () => {
    const { ctx, calls } = ctxWith(() => [{ id: "p1", slug: "p1", name: "Promo 1" }]);
    const out = (await callTool(ctx, "list_promotions", {})) as { promotions: unknown[] };
    expect(out.promotions).toHaveLength(1);
    expect(calls.every((c) => c.text.trim().toUpperCase().startsWith("SELECT"))).toBe(true);
  });

  it("get_promotion normalizes a legacy row to PromoDesignV2 without writing", async () => {
    const { ctx, calls } = ctxWith((text) =>
      text.includes("FROM promotions WHERE slug")
        ? [{
            id: "p1", slug: "legacy-promo", name: "Legacy", template_key: null, audience: "all",
            status: "draft", design: { blocks: [{ type: "text", text: "hi" }] },
            cta: { label: "Claim", action: "claim" }, display: {}, reward: {},
            starts_at: null, expires_at: null, max_claims: null, claim_count: 0, view_count: 0,
            grants_founding_member: false, design_version: 1, created_via: "console", updated_at: "2026-01-01",
          }]
        : [],
    );
    const out = (await callTool(ctx, "get_promotion", { slug: "legacy-promo" })) as {
      promotion: { design: PromoDesignV2 };
    };
    expect(out.promotion.design.version).toBe(2);
    expect(calls.every((c) => c.text.trim().toUpperCase().startsWith("SELECT"))).toBe(true);
  });

  it("get_promotion requires id or slug", async () => {
    const { ctx } = ctxWith(() => []);
    await expect(callTool(ctx, "get_promotion", {})).rejects.toThrow(ToolError);
  });
});

describe("preview_promotion — pure computation, describes the navigation graph and code srcdoc", () => {
  it("describes an inline candidate design without touching the database", async () => {
    const design = minimalDesign([
      minimalPage({ key: "a", ctas: [{ id: "cta-1", label: "Next", action: "goto_page", targetPageKey: "b" }] }),
      minimalPage({ key: "b", mode: "code", blocks: undefined, code: { html: "<p>hi</p>" }, ctas: [] }),
    ]);
    const { ctx, calls } = ctxWith(() => []);
    const out = (await callTool(ctx, "preview_promotion", { design })) as {
      pageCount: number;
      navigationEdges: Array<{ targetPageKey: string | null }>;
      pages: Array<{ key: string; code?: { srcdoc: string; bytes: number } }>;
    };
    expect(out.pageCount).toBe(2);
    expect(out.navigationEdges).toEqual([{ ctaId: "cta-1", label: "Next", targetPageKey: "b" }]);
    const codePage = out.pages.find((p) => p.key === "b");
    expect(codePage?.code?.srcdoc).toContain("<p>hi</p>");
    expect(codePage?.code?.srcdoc).not.toContain('sandbox="');
    expect(calls).toHaveLength(0); // no DB access at all for an inline design
  });

  it("rejects an invalid inline design with the same structural errors as the schema", async () => {
    const design = minimalDesign([minimalPage({ ctas: [{ id: "cta-1", label: "Go", action: "goto_page" }] })]);
    const { ctx } = ctxWith(() => []);
    await expect(callTool(ctx, "preview_promotion", { design })).rejects.toThrow(/targetPageKey/);
  });
});

describe("save_promotion_draft — writes ONLY to draft rows", () => {
  it("creates a new promotion as status='draft', created_via='mcp'", async () => {
    const { ctx, calls } = ctxWith((text) => {
      if (text.includes("SELECT 1 FROM promotions WHERE slug")) return [];
      if (text.includes("INSERT INTO promotions")) {
        return [{ id: "new-id", slug: "new-promo", name: "New promo", status: "draft", design: minimalDesign(), cta: {}, display: {}, reward: {}, design_version: 2, created_via: "mcp", starts_at: null, expires_at: null, max_claims: null, claim_count: 0, view_count: 0, grants_founding_member: false, template_key: null, audience: "all", updated_at: "2026-01-01" }];
      }
      return [];
    });
    const out = (await callTool(ctx, "save_promotion_draft", {
      name: "New promo",
      design: minimalDesign(),
    })) as { saved: boolean; promotion: { status: string; createdVia: string } };
    expect(out.saved).toBe(true);
    const insert = calls.find((c) => c.text.includes("INSERT INTO promotions"));
    expect(insert).toBeDefined();
    expect(insert!.text).toContain("'draft'");
  });

  it("refuses to update a promotion that is NOT currently a draft", async () => {
    const { ctx } = ctxWith((text) =>
      text.includes("SELECT status FROM promotions") ? [{ status: "active" }] : [],
    );
    await expect(
      callTool(ctx, "save_promotion_draft", { id: "11111111-1111-1111-1111-111111111111", name: "x", design: minimalDesign() }),
    ).rejects.toThrow(/only edits drafts/);
  });

  it("enforces PROMO_MAX_PAGES", async () => {
    const pages = Array.from({ length: PROMO_MAX_PAGES + 1 }, (_, i) => minimalPage({ key: `page-${i}` }));
    const { ctx } = ctxWith(() => []);
    await expect(
      callTool(ctx, "save_promotion_draft", { name: "x", design: minimalDesign(pages) }),
    ).rejects.toThrow(/at most/);
  });

  it("enforces PROMO_MAX_CTAS_PER_PAGE", async () => {
    const ctas = Array.from({ length: PROMO_MAX_CTAS_PER_PAGE + 1 }, (_, i) => ({
      id: `cta-${i}`, label: "x", action: "dismiss" as const,
    }));
    const { ctx } = ctxWith(() => []);
    await expect(
      callTool(ctx, "save_promotion_draft", { name: "x", design: minimalDesign([minimalPage({ ctas })]) }),
    ).rejects.toThrow(/more than/);
  });

  it("enforces the code-mode combined byte cap", async () => {
    const design = minimalDesign([
      minimalPage({ mode: "code", blocks: undefined, code: { html: "x".repeat(PROMO_CODE_MAX_BYTES + 1) } }),
    ]);
    const { ctx } = ctxWith(() => []);
    await expect(callTool(ctx, "save_promotion_draft", { name: "x", design })).rejects.toThrow(/over the/);
  });

  it("rejects a caller who fails the promotions admin gate", async () => {
    const { ctx } = ctxWith(() => [], NON_ADMIN_EMAIL); // no users row → no_user_row
    await expect(
      callTool(ctx, "save_promotion_draft", { name: "x", design: minimalDesign() }),
    ).rejects.toThrow(/Not authorized/);
  });
});

describe("publish_promotion — the deliberate exception, and its guardrails", () => {
  const PROMO_ID = "11111111-2222-3333-4444-555555555555";

  function existingRow(overrides: Record<string, unknown> = {}) {
    return {
      id: PROMO_ID, slug: "promo", name: "Promo", template_key: null, audience: "all",
      status: "draft", design: minimalDesign(), cta: {}, display: {}, reward: {},
      starts_at: null, expires_at: null, max_claims: null, claim_count: 0, view_count: 0,
      grants_founding_member: false, design_version: 2, created_via: "console",
      updated_at: "2026-01-01",
      ...overrides,
    };
  }

  it("REJECTS publishing when the admin re-verification fails, even with an otherwise-valid call", async () => {
    // No users row for this email → verifyAdminForPromotions returns no_user_row,
    // regardless of the fact this is a syntactically perfect publish call.
    const { ctx, calls } = ctxWith((text) =>
      text.includes("SELECT * FROM promotions WHERE id") ? [existingRow()] : [],
      NON_ADMIN_EMAIL,
    );
    await expect(callTool(ctx, "publish_promotion", { id: PROMO_ID })).rejects.toThrow(/Not authorized to publish/);
    // Never reached the UPDATE — the auth check runs before any write.
    expect(calls.some((c) => c.text.includes("UPDATE promotions SET"))).toBe(false);
  });

  it("REJECTS publishing for an admin whose role doesn't pass the promotions gate", async () => {
    const { ctx, calls } = ctxWith((text) => {
      if (text.includes("SELECT role, admin_role, clerk_id FROM users")) {
        return [{ role: "admin", admin_role: null, clerk_id: "user_1" }]; // no admin_role at all → fails
      }
      if (text.includes("SELECT * FROM promotions WHERE id")) return [existingRow()];
      return [];
    }, "plain-admin@getsweepr.com");
    await expect(callTool(ctx, "publish_promotion", { id: PROMO_ID })).rejects.toThrow(/Not authorized to publish/);
    expect(calls.some((c) => c.text.includes("UPDATE promotions SET"))).toBe(false);
  });

  it("rejects publishing a promotion id that doesn't exist", async () => {
    const { ctx } = ctxWith(() => []); // SELECT returns no rows
    await expect(callTool(ctx, "publish_promotion", { id: PROMO_ID })).rejects.toThrow(/No promotion with that id/);
  });

  it("publishes: sets status='active' by default, stamps created_via='mcp', and writes admin_audit_log", async () => {
    const { ctx, calls } = ctxWith((text) => {
      if (text.includes("SELECT * FROM promotions WHERE id")) return [existingRow()];
      if (text.includes("UPDATE promotions SET")) return [existingRow({ status: "active", created_via: "mcp" })];
      return [];
    });
    const out = (await callTool(ctx, "publish_promotion", { id: PROMO_ID })) as {
      published: boolean;
      promotion: { status: string };
    };
    expect(out.published).toBe(true);
    expect(out.promotion.status).toBe("active");

    const update = calls.find((c) => c.text.includes("UPDATE promotions SET"));
    expect(update).toBeDefined();
    expect(update!.values).toContain("active");
    expect(update!.text).toContain("'mcp'"); // created_via literal

    const audit = calls.find((c) => c.text.includes("INSERT INTO admin_audit_log"));
    expect(audit).toBeDefined();
    expect(audit!.values).toContain("promotion.published_via_mcp");
  });

  it("validates a replacement design with the same rigor as save_promotion_draft before publishing it", async () => {
    const badDesign = minimalDesign([minimalPage({ ctas: [{ id: "cta-1", label: "Go", action: "goto_page", targetPageKey: "missing" }] })]);
    const { ctx, calls } = ctxWith((text) => (text.includes("SELECT * FROM promotions WHERE id") ? [existingRow()] : []));
    await expect(callTool(ctx, "publish_promotion", { id: PROMO_ID, design: badDesign })).rejects.toThrow(/does not exist/);
    expect(calls.some((c) => c.text.includes("UPDATE promotions SET"))).toBe(false);
  });

  it("can re-publish a paused promotion back to active, or move one to paused/archived", async () => {
    const { ctx, calls } = ctxWith((text) => {
      if (text.includes("SELECT * FROM promotions WHERE id")) return [existingRow({ status: "paused" })];
      if (text.includes("UPDATE promotions SET")) return [existingRow({ status: "paused" })];
      return [];
    });
    const out = (await callTool(ctx, "publish_promotion", { id: PROMO_ID, status: "paused" })) as { published: boolean };
    expect(out.published).toBe(true);
    const update = calls.find((c) => c.text.includes("UPDATE promotions SET"));
    expect(update!.values).toContain("paused");
  });
});
