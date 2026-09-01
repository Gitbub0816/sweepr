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
 * apps/api/src/routes/adminPromotions.ts — the real PromoDesignV2 zod
 * schema (replacing the old `z.record(z.unknown())`), the design_version
 * upgrade-on-save behavior, and the create/update/status/delete audit
 * trail.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PROMO_MAX_PAGES,
  PROMO_MAX_CTAS_PER_PAGE,
  PROMO_CODE_MAX_BYTES,
  type PromoDesignV2,
  type PromoPageV2,
} from "@sweepr/utils";

const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
type Handler = (text: string, values: unknown[]) => unknown;
let handler: Handler = () => [];

vi.mock("../src/lib/db", () => ({
  getDb: () =>
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      sqlCalls.push({ text, values });
      return Promise.resolve(handler(text, values) ?? []);
    },
}));
vi.mock("../src/middleware/auth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { clerkId: "admin_1" });
    await next();
  },
}));
vi.mock("../src/middleware/adminRoles", () => ({
  requireAnyAdmin: async (_c: unknown, next: () => Promise<void>) => next(),
}));
const auditMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../src/lib/audit", () => ({ audit: (...args: unknown[]) => auditMock(...args) }));

import { adminPromotionsRouter } from "../src/routes/adminPromotions";

const ENV = { DATABASE_URL: "postgres://test" };
const PROMO_ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  sqlCalls.length = 0;
  auditMock.mockClear();
  handler = () => [];
});

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

function existingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROMO_ID,
    name: "Old name",
    audience: "all",
    status: "draft",
    design: { blocks: [] }, // legacy shape
    cta: { label: "Learn more", action: "dismiss" },
    display: { placement: "modal" },
    reward: {},
    starts_at: null,
    expires_at: null,
    max_claims: null,
    grants_founding_member: false,
    design_version: 1,
    ...overrides,
  };
}

async function putDesign(design: unknown, rowOverrides: Record<string, unknown> = {}) {
  handler = (text) => {
    if (text.includes("SELECT * FROM promotions WHERE id")) return [existingRow(rowOverrides)];
    if (text.includes("UPDATE promotions SET")) return [{ ...existingRow(rowOverrides), design }];
    return [];
  };
  return adminPromotionsRouter.request(
    `/${PROMO_ID}`,
    { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ design }) },
    ENV,
  );
}

describe("PUT /admin/promotions/:id — design validation", () => {
  it("rejects a design missing entryPageKey", async () => {
    const bad = { version: 2, pages: [minimalPage()] };
    const res = await putDesign(bad);
    expect(res.status).toBe(400);
  });

  it("rejects more pages than PROMO_MAX_PAGES", async () => {
    const pages = Array.from({ length: PROMO_MAX_PAGES + 1 }, (_, i) => minimalPage({ key: `page-${i}` }));
    const res = await putDesign(minimalDesign(pages));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { issues: Array<{ message: string }> } };
    expect(body.error.issues.some((i) => i.message.includes("at most"))).toBe(true);
  });

  it("rejects more CTAs on one page than PROMO_MAX_CTAS_PER_PAGE", async () => {
    const ctas = Array.from({ length: PROMO_MAX_CTAS_PER_PAGE + 1 }, (_, i) => ({
      id: `cta-${i}`, label: "x", action: "dismiss" as const,
    }));
    const res = await putDesign(minimalDesign([minimalPage({ ctas })]));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { issues: Array<{ message: string }> } };
    expect(body.error.issues.some((i) => i.message.includes("more than"))).toBe(true);
  });

  it("rejects a code-mode page over the combined byte cap", async () => {
    const design = minimalDesign([
      minimalPage({ mode: "code", blocks: undefined, code: { html: "x".repeat(PROMO_CODE_MAX_BYTES + 1) } }),
    ]);
    const res = await putDesign(design);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { issues: Array<{ message: string }> } };
    expect(body.error.issues.some((i) => i.message.includes("over the"))).toBe(true);
  });

  it("rejects a goto_page CTA whose target page doesn't exist", async () => {
    const design = minimalDesign([
      minimalPage({ ctas: [{ id: "cta-1", label: "Next", action: "goto_page", targetPageKey: "nowhere" }] }),
    ]);
    const res = await putDesign(design);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { issues: Array<{ message: string }> } };
    expect(body.error.issues.some((i) => i.message.includes("does not exist on this promotion"))).toBe(true);
  });

  it("rejects a newsletter CTA that doesn't require email", async () => {
    const design = minimalDesign([
      minimalPage({ ctas: [{ id: "cta-1", label: "Subscribe", action: "newsletter", requireField: "phone" }] }),
    ]);
    const res = await putDesign(design);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { issues: Array<{ message: string }> } };
    expect(body.error.issues.some((i) => i.message.includes('requireField="email"'))).toBe(true);
  });

  it("accepts a valid multi-page design and upgrades design_version to 2, clearing the legacy cta column", async () => {
    const design = minimalDesign([
      minimalPage({ key: "page-1", ctas: [{ id: "cta-1", label: "Next", action: "goto_page", targetPageKey: "page-2" }] }),
      minimalPage({ key: "page-2" }),
    ]);
    const res = await putDesign(design, { design_version: 1 });
    expect(res.status).toBe(200);

    const update = sqlCalls.find((c) => c.text.includes("UPDATE promotions SET"));
    expect(update).toBeDefined();
    // design_version and cta are both positional values in the UPDATE call —
    // assert the upgrade actually happened at the SQL layer, not just that
    // the route returned 200.
    expect(update!.values).toContain(2); // design_version
    expect(update!.values).toContain("{}"); // legacy cta column retired

    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "promotion.updated", targetId: PROMO_ID }),
    );
  });

  it("leaves design_version untouched when the update doesn't touch design", async () => {
    handler = (text) => {
      if (text.includes("SELECT * FROM promotions WHERE id")) return [existingRow({ design_version: 1 })];
      if (text.includes("UPDATE promotions SET")) return [existingRow({ design_version: 1 })];
      return [];
    };
    const res = await adminPromotionsRouter.request(
      `/${PROMO_ID}`,
      { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Renamed" }) },
      ENV,
    );
    expect(res.status).toBe(200);
    const update = sqlCalls.find((c) => c.text.includes("UPDATE promotions SET"));
    expect(update!.values).toContain(1); // design_version stays legacy
  });
});

describe("POST /admin/promotions — blank creation writes a v2 design", () => {
  it("creates with design_version 2, created_via console, one page, one CTA", async () => {
    handler = (text) => {
      if (text.includes("SELECT 1 FROM promotions WHERE slug")) return [];
      if (text.includes("INSERT INTO promotions")) return [{ id: PROMO_ID, name: "New promo" }];
      return [];
    };
    const res = await adminPromotionsRouter.request(
      "/",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "New promo" }) },
      ENV,
    );
    expect(res.status).toBe(201);
    const insert = sqlCalls.find((c) => c.text.includes("INSERT INTO promotions"));
    expect(insert).toBeDefined();
    expect(insert!.values).toContain(2); // design_version
    expect(insert!.text).toContain("'console'"); // created_via — a SQL literal, not a bound param
    const designJson = insert!.values.find((v) => typeof v === "string" && v.includes('"pages"')) as string;
    const design = JSON.parse(designJson) as PromoDesignV2;
    expect(design.pages).toHaveLength(1);
    expect(design.pages[0].ctas).toHaveLength(1);

    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "promotion.created" }),
    );
  });
});

describe("POST /admin/promotions/:id/status — audits the transition", () => {
  it("writes promotion.status_changed with the new status", async () => {
    handler = (text) => (text.includes("UPDATE promotions SET status") ? [{ id: PROMO_ID, status: "active" }] : []);
    const res = await adminPromotionsRouter.request(
      `/${PROMO_ID}/status`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "active" }) },
      ENV,
    );
    expect(res.status).toBe(200);
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "promotion.status_changed", metadata: { status: "active" } }),
    );
  });
});

describe("DELETE /admin/promotions/:id — audits archive-vs-delete", () => {
  it("audits a hard delete for a non-template row", async () => {
    handler = (text) => {
      if (text.includes("SELECT template_key FROM promotions")) return [{ template_key: null }];
      return [];
    };
    const res = await adminPromotionsRouter.request(`/${PROMO_ID}`, { method: "DELETE" }, ENV);
    expect(res.status).toBe(200);
    expect(sqlCalls.some((c) => c.text.includes("DELETE FROM promotions"))).toBe(true);
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "promotion.deleted", metadata: { archived: false } }),
    );
  });

  it("archives instead of deleting a template-backed row", async () => {
    handler = (text) => {
      if (text.includes("SELECT template_key FROM promotions")) return [{ template_key: "lead_capture" }];
      return [];
    };
    const res = await adminPromotionsRouter.request(`/${PROMO_ID}`, { method: "DELETE" }, ENV);
    expect(res.status).toBe(200);
    expect(sqlCalls.some((c) => c.text.includes("UPDATE promotions SET status = 'archived'"))).toBe(true);
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "promotion.deleted", metadata: { archived: true } }),
    );
  });
});
