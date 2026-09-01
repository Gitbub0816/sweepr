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
 * MCP promotions tool surface — the ONE DELIBERATE EXCEPTION to this
 * worker's "MCP never writes live data" rule.
 *
 * Every pricing tool in tools.ts writes only to `mcp_simulator_configs`, a
 * per-admin QUARANTINED sandbox — a human must load a proposal into the
 * admin console's Pricing Studio and click Publish before it ever affects a
 * customer. Promotions are different, on purpose: the product owner asked
 * for an LLM to be able to draft AND actually publish a promotion widget
 * through this MCP, without a console round-trip. So:
 *
 *   - list_promotions, get_promotion, preview_promotion — READ-ONLY /
 *     pure computation. No different from the pricing read tools.
 *   - save_promotion_draft — WRITES, but ONLY to rows whose status is
 *     (and stays) 'draft'. A draft is never served to a customer
 *     (`promotions.status = 'active'` plus the time/claim-cap window is
 *     what makes a promo live — see apps/api/src/lib/promotions.ts's
 *     `isLive`), so this is exactly as inert as the pricing sandbox: an
 *     admin previewing/iterating with an LLM cannot accidentally put
 *     anything in front of a customer through this tool. It REFUSES to
 *     touch a promotion that isn't currently a draft.
 *   - publish_promotion — THE EXCEPTION. Sets a promotion's status to
 *     'active' (or another admin-specified status) directly, no console
 *     step required. Guardrails, all enforced in code below:
 *       1. Admin-authenticated: re-verifies the caller's CURRENT role from
 *          the database at call time (`verifyAdminForPromotions` in
 *          adminAuth.ts) — not just the OAuth-time token claim every other
 *          tool call trusts. A demoted/deactivated admin loses publish
 *          access on their very next call.
 *       2. Schema-validated: the SAME zod rigor as the admin console
 *          (`promoDesignV2Schema` below, mirroring
 *          apps/api/src/routes/adminPromotions.ts's schema field-for-field,
 *          built from the SAME shared constants in
 *          packages/utils/src/promoSchema.ts) — page/CTA counts, code-mode
 *          byte cap, goto_page targets, requireField sanity. No looser than
 *          the console, ever.
 *       3. Code-mode sandboxed: any code-mode page still renders through
 *          `assemblePromoCodeSrcdoc` inside `sandbox="allow-scripts"` (no
 *          `allow-same-origin`) — this tool cannot loosen that; it isn't a
 *          parameter anywhere in this file (see promoSandbox.ts).
 *       4. Audited: writes BOTH the generic `mcp_action_log` entry every
 *          tool call gets (protocol.ts's `logToolCall`) AND a domain
 *          `admin_audit_log` row (action `promotion.published_via_mcp`) —
 *          the SAME table and shape apps/api/src/lib/audit.ts's `audit()`
 *          writes for a console-driven promotion change, so a publish via
 *          this tool shows up next to console changes in one place, not a
 *          separate log an admin has to remember to check.
 *       5. Provenance-stamped: `created_via = 'mcp'` (migration 108) — the
 *          admin promotions list flags these with a robot icon.
 *
 * This is NOT a template for future MCP tools. Every other write in this
 * worker stays sandboxed-only; do not copy this pattern for a new feature
 * without the same explicit, human, product-level decision that promotions
 * got. (That decision has been made exactly once more since — see
 * courseTools.ts's publish_course, for the same reason: an admin asked for
 * an LLM that can draft AND ship, this time for v2 training courses.)
 *
 * apps/mcp is a separate deployable Worker from apps/api — per this
 * monorepo's convention, apps never import each other's app code. This file
 * mirrors apps/api/src/routes/adminPromotions.ts's zod schema independently
 * (both import the SAME plain constants/types from packages/utils, a shared
 * package, so a new CTA action / page mode / block type is still a one-line
 * change both sides pick up) rather than importing a zod schema object
 * across the app boundary.
 */

import { z } from "zod";
import {
  PROMO_CTA_ACTIONS,
  PROMO_REQUIRE_FIELDS,
  PROMO_CLAIMANTS,
  PROMO_CTA_STYLES,
  PROMO_PAGE_MODES,
  PROMO_BLOCK_TYPES,
  PROMO_THEMES,
  PROMO_CANVAS_ASPECTS,
  PROMO_MAX_PAGES,
  PROMO_MAX_CTAS_PER_PAGE,
  PROMO_CODE_MAX_BYTES,
  validatePromoDesignV2Structure,
  toPromoDesignV2,
  promoCodeByteSize,
  assemblePromoCodeSrcdoc,
  collectAllCtas,
  type PromoDesignV2,
} from "@sweepr/utils";
import { verifyAdminForPromotions } from "../lib/adminAuth";
import { ToolError, type ToolContext } from "./toolContext";
import type { ToolDef } from "./tools";

export const PROMOTION_TOOL_NAMES = [
  "list_promotions",
  "get_promotion",
  "save_promotion_draft",
  "preview_promotion",
  "publish_promotion",
] as const;

// ── zod schema (mirrors adminPromotions.ts field-for-field) ─────────────────

const ctaSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(200),
  action: z.enum(PROMO_CTA_ACTIONS),
  style: z.enum(PROMO_CTA_STYLES).optional(),
  url: z.string().max(2000).optional(),
  requireField: z.enum(PROMO_REQUIRE_FIELDS).optional(),
  claimants: z.enum(PROMO_CLAIMANTS).optional(),
  successMessage: z.string().max(500).optional(),
  targetPageKey: z.string().max(80).optional(),
});

const blockSchema = z.object({
  type: z.enum(PROMO_BLOCK_TYPES),
  text: z.string().max(5000).optional(),
  src: z.string().max(2000).optional(),
  alt: z.string().max(300).optional(),
  items: z.array(z.string().max(500)).max(50).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  size: z.enum(["sm", "md", "lg", "xl"]).optional(),
});

const canvasElementSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(["text", "image", "shape", "button"]),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().optional(),
  text: z.string().max(5000).optional(),
  fontSize: z.number().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  color: z.string().max(50).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  bg: z.string().max(80).optional(),
  src: z.string().max(2000).optional(),
  fit: z.enum(["cover", "contain"]).optional(),
  radius: z.number().optional(),
  shape: z.enum(["rect", "ellipse"]).optional(),
  fill: z.string().max(80).optional(),
  stroke: z.string().max(80).optional(),
  strokeWidth: z.number().optional(),
  cta: ctaSchema.optional(),
  btnBg: z.string().max(80).optional(),
  btnColor: z.string().max(80).optional(),
});

const canvasSchema = z.object({
  aspect: z.enum(PROMO_CANVAS_ASPECTS).optional(),
  background: z.string().max(500).optional(),
  backgroundImage: z.string().max(2000).optional(),
  elements: z.array(canvasElementSchema).max(200),
});

const hotspotSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  cta: ctaSchema,
});

const posterSchema = z.object({
  src: z.string().max(2000),
  hotspots: z.array(hotspotSchema).max(50).optional(),
});

const codeSchema = z.object({
  html: z.string().max(200_000),
  css: z.string().max(200_000).optional(),
  js: z.string().max(200_000).optional(),
});

const pageSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/, "Page key may contain only letters, numbers, - and _"),
  name: z.string().max(200).optional(),
  mode: z.enum(PROMO_PAGE_MODES),
  theme: z.enum(PROMO_THEMES).optional(),
  background: z.string().max(500).optional(),
  accent: z.string().max(80).optional(),
  blocks: z.array(blockSchema).max(100).optional(),
  canvas: canvasSchema.optional(),
  poster: posterSchema.optional(),
  code: codeSchema.optional(),
  ctas: z.array(ctaSchema).max(PROMO_MAX_CTAS_PER_PAGE),
});

const promoDesignV2Schema = z
  .object({
    version: z.literal(2),
    theme: z.enum(PROMO_THEMES).optional(),
    accent: z.string().max(80).optional(),
    background: z.string().max(500).optional(),
    entryPageKey: z.string().min(1).max(80),
    pages: z.array(pageSchema).min(1).max(PROMO_MAX_PAGES),
  })
  .superRefine((design, ctx) => {
    const errors = validatePromoDesignV2Structure(design as unknown as PromoDesignV2);
    for (const message of errors) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  });

const draftArgsSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  audience: z.enum(["all", "visitors", "customers", "cleaners"]).optional(),
  design: promoDesignV2Schema,
  display: z.record(z.string(), z.unknown()).optional(),
  reward: z.record(z.string(), z.unknown()).optional(),
  startsAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  maxClaims: z.number().int().positive().nullable().optional(),
  grantsFoundingMember: z.boolean().optional(),
});

const publishArgsSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "paused", "archived", "draft"]).optional(),
  name: z.string().min(1).max(200).optional(),
  audience: z.enum(["all", "visitors", "customers", "cleaners"]).optional(),
  design: promoDesignV2Schema.optional(),
  display: z.record(z.string(), z.unknown()).optional(),
  reward: z.record(z.string(), z.unknown()).optional(),
  startsAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  maxClaims: z.number().int().positive().nullable().optional(),
  grantsFoundingMember: z.boolean().optional(),
});

// ── Tool definitions (MCP-facing JSON schema — loose; zod above does the
// real validation) ───────────────────────────────────────────────────────────

const designArgDescription =
  "PromoDesignV2: { version: 2, theme?, accent?, background?, entryPageKey, " +
  "pages: [{ key, name?, mode: 'blocks'|'canvas'|'poster'|'code', theme?, " +
  "accent?, background?, blocks?, canvas?, poster?, code?: {html,css?,js?}, " +
  "ctas: [{ id, label, action: 'claim'|'newsletter'|'waitlist'|'book_now'|" +
  "'link'|'goto_page'|'dismiss', style?, url?, requireField?, claimants?, " +
  "successMessage?, targetPageKey? }] }] }. See the " +
  "sweepr://promotions-design-guide resource for the full field-by-field " +
  "shape and worked examples before calling this with a design argument.";

export const PROMOTION_TOOL_DEFS: ToolDef[] = [
  {
    name: "list_promotions",
    description:
      "READ-ONLY: list promotions (id, slug, name, status, audience, design_version, created_via, view/claim counts, updated_at). Newest-updated first, capped at 50.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_promotion",
    description:
      "READ-ONLY: fetch one promotion by id or slug (pass exactly one), including its full design normalized to PromoDesignV2 (a legacy pre-v2 row is upgraded in memory — nothing is written), display rules, reward, expiry, and whether it's currently live.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "promotions.id (UUID)." },
        slug: { type: "string", description: "promotions.slug — the public /promo/:slug path." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "save_promotion_draft",
    description:
      "WRITE (draft-only): create a new promotion (status='draft') or update an EXISTING one that is still status='draft' — refused with a clear error if the target promotion is not a draft (use publish_promotion for anything already live, or ask an admin to move it back to draft in the console). Never served to a customer while status stays 'draft', so this is as inert as the pricing sandbox. Validated against the full PromoDesignV2 schema (page/CTA limits, code-mode byte cap, goto_page targets, requireField sanity) — invalid designs are refused with the specific errors. Stamps created_via='mcp'.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Omit to create a new promotion; pass an existing draft's id to update it." },
        name: { type: "string", description: "Admin-facing name (also seeds the public slug on create)." },
        audience: { type: "string", enum: ["all", "visitors", "customers", "cleaners"] },
        design: { type: "object", description: designArgDescription },
        display: { type: "object", description: "Display rules: {placement:'modal'|'banner'|'inline', pages?, delaySeconds?, persist?, frequency?, showOnFirstVisit?}." },
        reward: { type: "object", description: "{coupon?: {kind:'percent_off'|'amount_off'|'free_addon', value?, addonKey?, title?, validDays?, offerMinutes?, maxRedemptions?, minBookingTotalCents?, stackable?, maxStack?}}." },
        startsAt: { type: ["string", "null"], description: "ISO timestamp, or null to clear." },
        expiresAt: { type: ["string", "null"], description: "ISO timestamp, or null to clear." },
        maxClaims: { type: ["number", "null"], description: "Claim-count cap, or null for unlimited." },
        grantsFoundingMember: { type: "boolean" },
      },
      required: ["name", "design"],
      additionalProperties: false,
    },
  },
  {
    name: "preview_promotion",
    description:
      "READ-ONLY / pure computation: describe a promotion's pages and CTAs (mode, block/CTA summaries, the goto_page navigation graph) and, for any code-mode page, the EXACT sandboxed srcdoc the live widget would render (via the same assemblePromoCodeSrcdoc used in production — see promoSandbox.ts) plus its byte size against the cap. Pass either {id} or {slug} to preview a STORED promotion (any status, including drafts), or {design} to preview a candidate design that hasn't been saved yet. Nothing is written either way.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        slug: { type: "string" },
        design: { type: "object", description: designArgDescription },
      },
      additionalProperties: false,
    },
  },
  {
    name: "publish_promotion",
    description:
      "THE ONE DELIBERATE MCP WRITE THAT GOES LIVE — this tool sets an EXISTING promotion's status directly (default 'active'), no admin console step required. Guardrails: re-verifies your CURRENT admin role from the database at call time (not just your session token), validates any design change with the same schema rigor as the console (including the code-mode byte cap and goto_page target checks), and writes an admin_audit_log entry (action promotion.published_via_mcp) alongside the standard MCP action log. Requires an id — create the promotion first with save_promotion_draft (or use one already in the console). Optionally pass design/name/audience/display/reward/expiry/grantsFoundingMember to update-and-publish in one call.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "promotions.id (UUID) of an EXISTING promotion." },
        status: { type: "string", enum: ["active", "paused", "archived", "draft"], description: "Defaults to 'active'." },
        name: { type: "string" },
        audience: { type: "string", enum: ["all", "visitors", "customers", "cleaners"] },
        design: { type: "object", description: designArgDescription },
        display: { type: "object" },
        reward: { type: "object" },
        startsAt: { type: ["string", "null"] },
        expiresAt: { type: ["string", "null"] },
        maxClaims: { type: ["number", "null"] },
        grantsFoundingMember: { type: "boolean" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(ctx: ToolContext, name: string): Promise<string> {
  const base = slugify(name) || "promo";
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const existing = (await ctx.sql`SELECT 1 FROM promotions WHERE slug = ${slug} LIMIT 1`) as unknown[];
    if (existing.length === 0) break;
    slug = `${base}-${i}`;
  }
  return slug;
}

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
}

/** Every write this file makes also lands here — the same table and action
 *  naming apps/api/src/lib/audit.ts's `audit()` writes to from the admin
 *  console, so an MCP-driven change shows up next to console changes in one
 *  audit trail. Never throws (audit failures must not block the write that
 *  already succeeded). */
async function writeAdminAudit(
  ctx: ToolContext,
  entry: { action: string; actorClerkId: string; targetId: string; metadata: Record<string, unknown> },
): Promise<void> {
  try {
    await ctx.sql`
      INSERT INTO admin_audit_log (action, actor_clerk_id, target_type, target_id, metadata, created_at)
      VALUES (${entry.action}, ${entry.actorClerkId}, 'promotion', ${entry.targetId},
              ${JSON.stringify(entry.metadata)}, ${new Date().toISOString()})
    `;
  } catch {
    // best-effort, matching lib/audit.ts's own never-throw contract
  }
}

interface PromotionRow {
  id: string;
  slug: string;
  name: string;
  template_key: string | null;
  audience: string;
  status: string;
  design: unknown;
  cta: unknown;
  display: unknown;
  reward: unknown;
  starts_at: string | null;
  expires_at: string | null;
  max_claims: number | null;
  claim_count: number;
  view_count: number;
  grants_founding_member: boolean;
  design_version: number;
  created_via: string;
  updated_at: string;
}

function isPromotionLive(p: PromotionRow, now = Date.now()): boolean {
  if (p.status !== "active") return false;
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return false;
  if (p.expires_at && new Date(p.expires_at).getTime() <= now) return false;
  if (p.max_claims !== null && p.claim_count >= p.max_claims) return false;
  return true;
}

function toView(p: PromotionRow) {
  const design = toPromoDesignV2(p.design, p.cta, p.design_version);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    templateKey: p.template_key,
    audience: p.audience,
    status: p.status,
    live: isPromotionLive(p),
    design,
    display: p.display,
    reward: p.reward,
    startsAt: p.starts_at,
    expiresAt: p.expires_at,
    maxClaims: p.max_claims,
    claimCount: p.claim_count,
    viewCount: p.view_count,
    grantsFoundingMember: p.grants_founding_member,
    designVersion: p.design_version,
    createdVia: p.created_via,
    updatedAt: p.updated_at,
  };
}

function describeDesign(design: PromoDesignV2) {
  return {
    entryPageKey: design.entryPageKey,
    pageCount: design.pages.length,
    pages: design.pages.map((page) => ({
      key: page.key,
      name: page.name ?? page.key,
      mode: page.mode,
      isEntry: page.key === design.entryPageKey,
      ctas: (page.ctas ?? []).map((c) => ({
        id: c.id,
        label: c.label,
        action: c.action,
        style: c.style ?? "primary",
        targetPageKey: c.targetPageKey,
      })),
      ...(page.mode === "code" && page.code
        ? {
            code: {
              bytes: promoCodeByteSize(page.code),
              maxBytes: PROMO_CODE_MAX_BYTES,
              srcdoc: assemblePromoCodeSrcdoc(page.code),
            },
          }
        : {}),
    })),
    // goto_page edges across the WHOLE design (page ctas + canvas buttons +
    // poster hotspots), so an LLM can sanity-check the navigation graph —
    // e.g. spot an alternate page nothing links to.
    navigationEdges: collectAllCtas(design)
      .filter((c) => c.action === "goto_page")
      .map((c) => ({ ctaId: c.id, label: c.label, targetPageKey: c.targetPageKey ?? null })),
  };
}

// ── Dispatch ──────────────────────────────────────────────────────────────

export async function callPromotionTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "list_promotions": {
      const rows = await ctx.sql`
        SELECT id, slug, name, status, audience, design_version, created_via,
               grants_founding_member, view_count, claim_count, updated_at
        FROM promotions ORDER BY updated_at DESC LIMIT 50
      `;
      return { promotions: rows };
    }

    case "get_promotion": {
      const id = typeof args.id === "string" ? args.id : undefined;
      const slug = typeof args.slug === "string" ? args.slug : undefined;
      if (!id && !slug) throw new ToolError("Pass either id or slug.");
      const rows = (id
        ? await ctx.sql`SELECT * FROM promotions WHERE id = ${id}::uuid LIMIT 1`
        : await ctx.sql`SELECT * FROM promotions WHERE slug = ${slug} LIMIT 1`) as PromotionRow[];
      if (!rows[0]) throw new ToolError("No promotion with that id/slug.");
      return { promotion: toView(rows[0]) };
    }

    case "preview_promotion": {
      let design: PromoDesignV2;
      if (args.design !== undefined) {
        const parsed = promoDesignV2Schema.safeParse(args.design);
        if (!parsed.success) throw new ToolError(`Invalid design: ${zodMessage(parsed.error)}`);
        design = parsed.data as unknown as PromoDesignV2;
      } else {
        const id = typeof args.id === "string" ? args.id : undefined;
        const slug = typeof args.slug === "string" ? args.slug : undefined;
        if (!id && !slug) throw new ToolError("Pass id, slug, or an inline design to preview.");
        const rows = (id
          ? await ctx.sql`SELECT * FROM promotions WHERE id = ${id}::uuid LIMIT 1`
          : await ctx.sql`SELECT * FROM promotions WHERE slug = ${slug} LIMIT 1`) as PromotionRow[];
        if (!rows[0]) throw new ToolError("No promotion with that id/slug.");
        design = toPromoDesignV2(rows[0].design, rows[0].cta, rows[0].design_version);
      }
      return describeDesign(design);
    }

    case "save_promotion_draft": {
      const parsed = draftArgsSchema.safeParse(args);
      if (!parsed.success) throw new ToolError(zodMessage(parsed.error));
      const b = parsed.data;

      const verdict = await verifyAdminForPromotions(ctx.env, ctx.sql, ctx.adminEmail);
      if (!verdict.ok) {
        throw new ToolError(`Not authorized to write promotions (${verdict.reason}).`);
      }

      if (b.id) {
        const cur = (await ctx.sql`SELECT status FROM promotions WHERE id = ${b.id}::uuid LIMIT 1`) as Array<{
          status: string;
        }>;
        if (!cur[0]) throw new ToolError("No promotion with that id.");
        if (cur[0].status !== "draft") {
          throw new ToolError(
            `This promotion is status='${cur[0].status}', not 'draft' — save_promotion_draft only edits drafts. ` +
              "Use publish_promotion to change something already live, or move it back to draft in the admin console first.",
          );
        }
        const rows = (await ctx.sql`
          UPDATE promotions SET
            name = ${b.name}, audience = ${b.audience ?? "all"},
            design = ${JSON.stringify(b.design)}::jsonb, cta = '{}'::jsonb, design_version = 2,
            display = ${JSON.stringify(b.display ?? {})}::jsonb,
            reward = ${JSON.stringify(b.reward ?? {})}::jsonb,
            starts_at = ${b.startsAt ?? null}, expires_at = ${b.expiresAt ?? null},
            max_claims = ${b.maxClaims ?? null},
            grants_founding_member = ${b.grantsFoundingMember ?? false},
            created_via = 'mcp', updated_at = NOW()
          WHERE id = ${b.id}::uuid
          RETURNING *
        `) as PromotionRow[];
        await writeAdminAudit(ctx, {
          action: "promotion.updated",
          actorClerkId: verdict.admin.clerkId ?? `mcp:${verdict.admin.email}`,
          targetId: b.id,
          metadata: { via: "mcp", adminEmail: verdict.admin.email, pageCount: b.design.pages.length },
        });
        return { saved: true, promotion: toView(rows[0]) };
      }

      const slug = await uniqueSlug(ctx, b.name);
      const rows = (await ctx.sql`
        INSERT INTO promotions (
          slug, name, audience, status, design, cta, display, reward,
          grants_founding_member, starts_at, expires_at, max_claims,
          design_version, created_via
        ) VALUES (
          ${slug}, ${b.name}, ${b.audience ?? "all"}, 'draft',
          ${JSON.stringify(b.design)}::jsonb, '{}'::jsonb,
          ${JSON.stringify(b.display ?? { placement: "modal", delaySeconds: 3, persist: false, frequency: "once", showOnFirstVisit: true })}::jsonb,
          ${JSON.stringify(b.reward ?? {})}::jsonb,
          ${b.grantsFoundingMember ?? false}, ${b.startsAt ?? null}, ${b.expiresAt ?? null},
          ${b.maxClaims ?? null}, 2, 'mcp'
        )
        RETURNING *
      `) as PromotionRow[];
      await writeAdminAudit(ctx, {
        action: "promotion.created",
        actorClerkId: verdict.admin.clerkId ?? `mcp:${verdict.admin.email}`,
        targetId: rows[0].id,
        metadata: { via: "mcp", adminEmail: verdict.admin.email, pageCount: b.design.pages.length },
      });
      return { saved: true, promotion: toView(rows[0]) };
    }

    case "publish_promotion": {
      const parsed = publishArgsSchema.safeParse(args);
      if (!parsed.success) throw new ToolError(zodMessage(parsed.error));
      const b = parsed.data;

      // Guardrail 1: re-verify the CURRENT admin role from the database —
      // not just the OAuth-session token every other tool call trusts. This
      // is the one tool in the whole worker where that extra check earns
      // its cost.
      const verdict = await verifyAdminForPromotions(ctx.env, ctx.sql, ctx.adminEmail);
      if (!verdict.ok) {
        throw new ToolError(
          `Not authorized to publish promotions (${verdict.reason}). This is the one MCP tool that changes ` +
            "live customer-facing content, so it re-checks your admin role on every call.",
        );
      }

      const cur = (await ctx.sql`SELECT * FROM promotions WHERE id = ${b.id}::uuid LIMIT 1`) as PromotionRow[];
      if (!cur[0]) {
        throw new ToolError("No promotion with that id. Create one first with save_promotion_draft.");
      }
      const p = cur[0];

      // Guardrail 2: schema-validated with the exact same rigor as the
      // console — page/CTA counts, code-mode byte cap, goto_page targets,
      // requireField sanity all ran inside publishArgsSchema's parse above
      // when `design` was provided.
      const status = b.status ?? "active";
      const design = b.design ? JSON.stringify(b.design) : JSON.stringify(p.design);
      const cta = b.design ? "{}" : JSON.stringify(p.cta);
      const designVersion = b.design ? 2 : p.design_version;
      const name = b.name ?? p.name;
      const audience = b.audience ?? p.audience;
      const display = b.display ? JSON.stringify(b.display) : JSON.stringify(p.display);
      const reward = b.reward ? JSON.stringify(b.reward) : JSON.stringify(p.reward ?? {});
      const startsAt = b.startsAt === undefined ? p.starts_at : b.startsAt;
      const expiresAt = b.expiresAt === undefined ? p.expires_at : b.expiresAt;
      const maxClaims = b.maxClaims === undefined ? p.max_claims : b.maxClaims;
      const grants = b.grantsFoundingMember ?? p.grants_founding_member;

      const rows = (await ctx.sql`
        UPDATE promotions SET
          name = ${name}, audience = ${audience}, status = ${status},
          design = ${design}::jsonb, cta = ${cta}::jsonb, design_version = ${designVersion},
          display = ${display}::jsonb, reward = ${reward}::jsonb,
          starts_at = ${startsAt}, expires_at = ${expiresAt}, max_claims = ${maxClaims},
          grants_founding_member = ${grants}, created_via = 'mcp', updated_at = NOW()
        WHERE id = ${b.id}::uuid
        RETURNING *
      `) as PromotionRow[];

      // Guardrail 4: the mandatory, domain-specific audit entry — on top of
      // the generic mcp_action_log row protocol.ts's logToolCall already
      // writes for every tool call.
      await writeAdminAudit(ctx, {
        action: "promotion.published_via_mcp",
        actorClerkId: verdict.admin.clerkId ?? `mcp:${verdict.admin.email}`,
        targetId: b.id,
        metadata: {
          via: "mcp",
          adminEmail: verdict.admin.email,
          previousStatus: p.status,
          newStatus: status,
          designChanged: b.design !== undefined,
        },
      });

      return {
        published: true,
        promotion: toView(rows[0]),
        guardrails:
          "Re-verified your admin role from the database, validated the design with the same schema " +
          "the console uses, and logged this to admin_audit_log (promotion.published_via_mcp) alongside " +
          "the standard MCP action log.",
      };
    }

    default:
      throw new ToolError(`Unknown promotion tool: ${name}`);
  }
}
