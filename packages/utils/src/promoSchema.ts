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
 * Shared vocabulary for the promotions engine (design v2: multi-page, multi-
 * CTA, code-mode). This is the ONE place the enumerable option sets live —
 * apps/api's zod schema (packages/db-backed source of truth), apps/mcp's
 * mirrored zod schema (a separate deployable worker, kept in sync with
 * apps/api's by importing these same constants — see the note in
 * apps/mcp/src/mcp/promotionTools.ts), packages/ui's renderer, and the admin
 * designer all import from here instead of repeating string literals. Adding
 * a new CTA action, page mode, or block type is a one-line change here that
 * every layer picks up (the zod enums below are built FROM these arrays).
 */

export const PROMO_CTA_ACTIONS = [
  "claim",
  "newsletter",
  "waitlist",
  "book_now",
  "link",
  "goto_page",
  "dismiss",
] as const;
export type PromoCtaAction = (typeof PROMO_CTA_ACTIONS)[number];

/**
 * Actions that record a `promotion_claims` row (and so can grant a reward
 * coupon / Founding Member status / newsletter or waitlist signup). This is
 * the single place claim-eligibility is decided — any CTA with one of these
 * actions, on ANY page of a promotion, can trigger a claim.
 */
export const PROMO_CLAIM_ACTIONS: readonly PromoCtaAction[] = [
  "claim",
  "newsletter",
  "waitlist",
  "book_now",
];

export const PROMO_REQUIRE_FIELDS = ["none", "email", "phone"] as const;
export type PromoRequireField = (typeof PROMO_REQUIRE_FIELDS)[number];

export const PROMO_CLAIMANTS = ["anonymous", "signed_in", "both"] as const;
export type PromoClaimants = (typeof PROMO_CLAIMANTS)[number];

/** Visual weight of a rendered CTA button — purely presentational. */
export const PROMO_CTA_STYLES = ["primary", "secondary", "ghost", "link"] as const;
export type PromoCtaStyle = (typeof PROMO_CTA_STYLES)[number];

/** A page's authoring mode. Mutually exclusive — validated server-side. */
export const PROMO_PAGE_MODES = ["blocks", "canvas", "poster", "code"] as const;
export type PromoPageMode = (typeof PROMO_PAGE_MODES)[number];

export const PROMO_BLOCK_TYPES = [
  "badge",
  "heading",
  "subheading",
  "text",
  "image",
  "divider",
  "spacer",
  "bullets",
] as const;
export type PromoBlockType = (typeof PROMO_BLOCK_TYPES)[number];

export const PROMO_THEMES = ["light", "dark", "brand"] as const;
export type PromoTheme = (typeof PROMO_THEMES)[number];

export const PROMO_CANVAS_ASPECTS = ["4:5", "1:1", "16:9", "3:4"] as const;
export type PromoCanvasAspect = (typeof PROMO_CANVAS_ASPECTS)[number];

/** Provenance of a promotion row: who/what created it. Informational only. */
export const PROMO_CREATED_VIA = ["console", "mcp"] as const;
export type PromoCreatedVia = (typeof PROMO_CREATED_VIA)[number];

/**
 * Combined size cap (bytes, UTF-8) for a code-mode page's html+css+js. Big
 * enough for a real self-contained widget, small enough to keep the DB row
 * and the srcdoc assembly cheap. Enforced by zod server-side AND checked
 * again by the sandbox assembler — see packages/utils/src/promoSandbox.ts.
 */
export const PROMO_CODE_MAX_BYTES = 200_000;

export const PROMO_MAX_PAGES = 20;
export const PROMO_MAX_CTAS_PER_PAGE = 12;

/** Default key of the first page a fresh or legacy-upgraded design gets. */
export const PROMO_DEFAULT_PAGE_KEY = "page-1";

/** Design-shape version stamped on `promotions.design_version`. */
export const PROMO_DESIGN_V2 = 2;
export const PROMO_DESIGN_LEGACY = 1;

// ─── Design v2 shape ─────────────────────────────────────────────────────────
//
// A promotion's `design` JSONB column holds ONE of two shapes, distinguished
// by the `promotions.design_version` column (see migration 108):
//
//  - design_version = 1 (legacy): `{ theme?, background?, accent?, blocks,
//    poster?, canvas? }` with a SEPARATE top-level `cta` column holding one
//    `LegacyPromoCta`. This is every promotion created before this file.
//  - design_version = 2 (current): `PromoDesignV2` below — an ordered array
//    of PAGES, each with its own authoring `mode` and its own `ctas[]`
//    array. The legacy `cta` column is no longer read for v2 rows (kept only
//    so the column doesn't need to be dropped).
//
// `normalizeLegacyPromoDesign` upgrades shape 1 into shape 2 IN MEMORY at
// read time (see apps/api/src/lib/promotions.ts) — no backfill migration is
// required, and nothing that already rendered a v1 promotion breaks. Saving
// a promotion through the rebuilt admin designer (or the MCP) always writes
// shape 2 going forward.

/** One call-to-action button. The SAME shape is used for a page's own
 *  `ctas[]` list, a canvas element's embedded button, and a poster hotspot's
 *  button — one vocabulary, three places it can appear. */
export interface PromoCtaV2 {
  /** Stable within the promotion (not just the page) so the MCP and the
   *  claim API can address one exact CTA out of many. */
  id: string;
  label: string;
  action: PromoCtaAction;
  style?: PromoCtaStyle;
  /** action = 'link' (required) or 'book_now' (optional redirect after claim). */
  url?: string;
  requireField?: PromoRequireField;
  claimants?: PromoClaimants;
  successMessage?: string;
  /** action = 'goto_page' (required): the target page's `key` within this
   *  same promotion's `pages[]`. */
  targetPageKey?: string;
}

export interface PromoBlockV2 {
  type: PromoBlockType;
  text?: string;
  src?: string;
  alt?: string;
  items?: string[];
  align?: "left" | "center" | "right";
  size?: "sm" | "md" | "lg" | "xl";
}

export interface PromoCanvasElementV2 {
  id: string;
  type: "text" | "image" | "shape" | "button";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  // text
  text?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  bg?: string;
  // image
  src?: string;
  fit?: "cover" | "contain";
  radius?: number;
  // shape
  shape?: "rect" | "ellipse";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  // button
  cta?: PromoCtaV2;
  btnBg?: string;
  btnColor?: string;
}

export interface PromoCanvasV2 {
  aspect?: PromoCanvasAspect;
  background?: string;
  backgroundImage?: string;
  elements: PromoCanvasElementV2[];
}

export interface PromoHotspotV2 {
  x: number;
  y: number;
  w: number;
  h: number;
  cta: PromoCtaV2;
}

export interface PromoPosterV2 {
  src: string;
  hotspots?: PromoHotspotV2[];
}

/** Uploaded/pasted code, assembled into a sandboxed srcdoc by promoSandbox.ts. */
export interface PromoCodeV2 {
  html: string;
  css?: string;
  js?: string;
}

export interface PromoPageV2 {
  /** Stable id within the promotion, e.g. "page-1". Admin-editable slug-ish
   *  string; the ONLY thing `goto_page` CTAs address. */
  key: string;
  /** Admin-facing label shown in the page list (e.g. "Alternate offer"). */
  name?: string;
  /** Which content field below is authoritative. The OTHER content fields
   *  may still be present (non-destructive mode switching in the admin
   *  editor keeps them around) but are not rendered while inactive. */
  mode: PromoPageMode;
  theme?: PromoTheme;
  background?: string;
  accent?: string;
  blocks?: PromoBlockV2[];
  canvas?: PromoCanvasV2;
  poster?: PromoPosterV2;
  code?: PromoCodeV2;
  /** Buttons rendered below the page content. May be empty (a canvas/poster
   *  page can carry all its interactivity in embedded button/hotspot CTAs
   *  instead). Order = display order. */
  ctas: PromoCtaV2[];
}

export interface PromoDesignV2 {
  version: 2;
  theme?: PromoTheme;
  accent?: string;
  background?: string;
  /** The `key` of the page shown first. */
  entryPageKey: string;
  pages: PromoPageV2[];
}

// ─── Legacy (design_version 1) shapes — read-only, for the normalizer ───────

export interface LegacyPromoCta {
  label: string;
  action: string;
  url?: string;
  requireField?: string;
  claimants?: string;
  secondary?: { label: string; url: string };
  successMessage?: string;
}
export interface LegacyPromoBlock {
  type: string;
  text?: string;
  src?: string;
  alt?: string;
  items?: string[];
  align?: string;
  size?: string;
}
export interface LegacyPromoHotspot {
  x: number;
  y: number;
  w: number;
  h: number;
  cta: LegacyPromoCta;
}
export interface LegacyPromoCanvasElement {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  text?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: string;
  bg?: string;
  src?: string;
  fit?: string;
  radius?: number;
  shape?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cta?: LegacyPromoCta;
  btnBg?: string;
  btnColor?: string;
}
export interface LegacyPromoDesign {
  theme?: string;
  background?: string;
  accent?: string;
  blocks?: LegacyPromoBlock[];
  poster?: { src: string; hotspots?: LegacyPromoHotspot[] };
  canvas?: {
    aspect?: string;
    background?: string;
    backgroundImage?: string;
    elements?: LegacyPromoCanvasElement[];
  };
}

// ─── Type guards (defensive — legacy JSONB rows predate every enum here) ────

function oneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

function toV2Cta(c: LegacyPromoCta | undefined, id: string, style: PromoCtaStyle): PromoCtaV2 | null {
  if (!c || typeof c.label !== "string") return null;
  return {
    id,
    label: c.label,
    action: oneOf(PROMO_CTA_ACTIONS, c.action) ? c.action : "dismiss",
    style,
    url: c.url,
    requireField: oneOf(PROMO_REQUIRE_FIELDS, c.requireField) ? c.requireField : undefined,
    claimants: oneOf(PROMO_CLAIMANTS, c.claimants) ? c.claimants : undefined,
    successMessage: c.successMessage,
  };
}

function toV2Block(b: LegacyPromoBlock): PromoBlockV2 {
  return {
    type: oneOf(PROMO_BLOCK_TYPES, b.type) ? b.type : "text",
    text: b.text,
    src: b.src,
    alt: b.alt,
    items: b.items,
    align: b.align === "center" || b.align === "right" ? b.align : "left",
    size: oneOf(["sm", "md", "lg", "xl"] as const, b.size) ? (b.size as PromoBlockV2["size"]) : undefined,
  };
}

function toV2Canvas(canvas: LegacyPromoDesign["canvas"]): PromoCanvasV2 | undefined {
  if (!canvas) return undefined;
  const elements: PromoCanvasElementV2[] = (canvas.elements ?? []).map((el, i) => ({
    id: el.id || `el-${i}`,
    type: el.type === "text" || el.type === "image" || el.type === "shape" || el.type === "button" ? el.type : "text",
    x: el.x, y: el.y, w: el.w, h: el.h,
    rotation: el.rotation,
    text: el.text, fontSize: el.fontSize, bold: el.bold, italic: el.italic, color: el.color,
    align: el.align === "center" || el.align === "right" ? el.align : el.align === "left" ? "left" : undefined,
    bg: el.bg,
    src: el.src, fit: el.fit === "contain" ? "contain" : el.fit === "cover" ? "cover" : undefined,
    radius: el.radius,
    shape: el.shape === "ellipse" ? "ellipse" : el.shape === "rect" ? "rect" : undefined,
    fill: el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth,
    cta: toV2Cta(el.cta, `${el.id || `el-${i}`}-cta`, "primary") ?? undefined,
    btnBg: el.btnBg, btnColor: el.btnColor,
  }));
  return {
    aspect: oneOf(PROMO_CANVAS_ASPECTS, canvas.aspect) ? canvas.aspect : undefined,
    background: canvas.background,
    backgroundImage: canvas.backgroundImage,
    elements,
  };
}

function toV2Poster(poster: LegacyPromoDesign["poster"]): PromoPosterV2 | undefined {
  if (!poster?.src) return undefined;
  return {
    src: poster.src,
    hotspots: (poster.hotspots ?? [])
      .map((h, i) => {
        const cta = toV2Cta(h.cta, `hotspot-${i}-cta`, "primary");
        if (!cta) return null;
        return { x: h.x, y: h.y, w: h.w, h: h.h, cta };
      })
      .filter((h): h is PromoHotspotV2 => h !== null),
  };
}

/**
 * Upgrade a legacy (design_version 1) `{design, cta}` pair into a one-page
 * `PromoDesignV2`. Pure and total — never throws, always returns a
 * renderable design even from a malformed/partial legacy row. The single
 * page's mode is inferred exactly the way the old renderer picked a mode:
 * canvas (if it has elements) beats poster (if it has an image) beats blocks.
 */
export function normalizeLegacyPromoDesign(
  design: LegacyPromoDesign | null | undefined,
  cta: LegacyPromoCta | null | undefined,
): PromoDesignV2 {
  const d = design ?? {};
  const mainCta = toV2Cta(cta ?? undefined, "cta-1", "primary") ?? {
    id: "cta-1",
    label: "Continue",
    action: "dismiss" as const,
    style: "primary" as const,
  };
  const ctas: PromoCtaV2[] = [mainCta];
  if (cta?.secondary?.label && cta.secondary.url) {
    ctas.push({
      id: "cta-2",
      label: cta.secondary.label,
      action: "link",
      url: cta.secondary.url,
      style: "secondary",
    });
  }

  const canvas = toV2Canvas(d.canvas);
  const poster = toV2Poster(d.poster);
  const mode: PromoPageMode = canvas?.elements.length ? "canvas" : poster?.src ? "poster" : "blocks";

  const page: PromoPageV2 = {
    key: PROMO_DEFAULT_PAGE_KEY,
    name: "Page 1",
    mode,
    blocks: (d.blocks ?? []).map(toV2Block),
    canvas,
    poster,
    ctas,
  };

  return {
    version: 2,
    theme: oneOf(PROMO_THEMES, d.theme) ? d.theme : "light",
    accent: d.accent,
    background: d.background,
    entryPageKey: PROMO_DEFAULT_PAGE_KEY,
    pages: [page],
  };
}

/**
 * Resolve a promotion row's design to `PromoDesignV2` regardless of which
 * shape is stored. `designVersion` comes from `promotions.design_version`
 * (see migration 108); anything other than exactly 2 is treated as legacy,
 * so a corrupt/unexpected value fails safe into the upgrade path rather than
 * trusting an unvalidated shape.
 */
export function toPromoDesignV2(
  design: unknown,
  cta: unknown,
  designVersion: number | null | undefined,
): PromoDesignV2 {
  if (
    designVersion === PROMO_DESIGN_V2 &&
    design &&
    typeof design === "object" &&
    (design as { version?: unknown }).version === 2 &&
    Array.isArray((design as { pages?: unknown }).pages)
  ) {
    return design as PromoDesignV2;
  }
  return normalizeLegacyPromoDesign(
    (design ?? undefined) as LegacyPromoDesign | undefined,
    (cta ?? undefined) as LegacyPromoCta | undefined,
  );
}

// ─── Structural helpers shared by every zod schema (api + mcp) and by the
//     admin editor / MCP tools for cheap client-side checks ─────────────────

/** Every CTA anywhere in a design: page-level, canvas buttons, poster
 *  hotspots — the full set `goto_page` / claim-eligibility logic must see. */
export function collectAllCtas(design: PromoDesignV2): PromoCtaV2[] {
  const out: PromoCtaV2[] = [];
  for (const page of design.pages) {
    out.push(...(page.ctas ?? []));
    for (const el of page.canvas?.elements ?? []) if (el.cta) out.push(el.cta);
    for (const h of page.poster?.hotspots ?? []) out.push(h.cta);
  }
  return out;
}

export function collectPageKeys(design: PromoDesignV2): string[] {
  return design.pages.map((p) => p.key);
}

/** Find one CTA by id, plus the page it lives on. Searches page.ctas, then
 *  canvas buttons, then poster hotspots, in that order. */
export function findCtaById(
  design: PromoDesignV2,
  ctaId: string,
): { page: PromoPageV2; cta: PromoCtaV2 } | null {
  for (const page of design.pages) {
    const direct = (page.ctas ?? []).find((c) => c.id === ctaId);
    if (direct) return { page, cta: direct };
    const canvasHit = (page.canvas?.elements ?? []).find((el) => el.cta?.id === ctaId)?.cta;
    if (canvasHit) return { page, cta: canvasHit };
    const posterHit = (page.poster?.hotspots ?? []).find((h) => h.cta.id === ctaId)?.cta;
    if (posterHit) return { page, cta: posterHit };
  }
  return null;
}

/**
 * The CTA a claim POST should be evaluated against when the caller didn't
 * name one explicitly (older/simpler clients, or a legacy-upgraded promo
 * that only ever had one). Prefers the entry page, then a claim-eligible
 * action (see PROMO_CLAIM_ACTIONS) over 'link'/'dismiss'/'goto_page'.
 */
export function defaultClaimCta(design: PromoDesignV2): { page: PromoPageV2; cta: PromoCtaV2 } | null {
  const ordered = [
    ...design.pages.filter((p) => p.key === design.entryPageKey),
    ...design.pages.filter((p) => p.key !== design.entryPageKey),
  ];
  for (const page of ordered) {
    const claimy = (page.ctas ?? []).find((c) => PROMO_CLAIM_ACTIONS.includes(c.action));
    if (claimy) return { page, cta: claimy };
  }
  for (const page of ordered) {
    if (page.ctas?.[0]) return { page, cta: page.ctas[0] };
  }
  return null;
}

/** Bytes (UTF-8) a code-mode page's html+css+js combine to. */
export function promoCodeByteSize(code: { html?: string; css?: string; js?: string }): number {
  const enc = new TextEncoder();
  return (
    enc.encode(code.html ?? "").length +
    enc.encode(code.css ?? "").length +
    enc.encode(code.js ?? "").length
  );
}

/**
 * Every structural rule a `PromoDesignV2` must satisfy, beyond per-field
 * shape (which each app's own zod schema enforces — see the docblock at the
 * top of this file for why the zod objects themselves are NOT centralized
 * here). Both apps/api's and apps/mcp's schemas call this from a
 * `superRefine` so the cross-cutting semantics — the parts that need to see
 * the WHOLE design, not one field — can never drift between them. Returns
 * a flat list of human-readable error strings; empty = valid.
 */
export function validatePromoDesignV2Structure(design: PromoDesignV2): string[] {
  const errors: string[] = [];

  if (design.pages.length === 0) errors.push("A promotion needs at least one page.");
  if (design.pages.length > PROMO_MAX_PAGES) {
    errors.push(`A promotion may have at most ${PROMO_MAX_PAGES} pages.`);
  }

  const keys = collectPageKeys(design);
  const seen = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) errors.push(`Duplicate page key "${k}" — page keys must be unique.`);
    seen.add(k);
  }
  if (!keys.includes(design.entryPageKey)) {
    errors.push(`entryPageKey "${design.entryPageKey}" does not match any page's key.`);
  }

  for (const page of design.pages) {
    if ((page.ctas ?? []).length > PROMO_MAX_CTAS_PER_PAGE) {
      errors.push(`Page "${page.key}" has more than ${PROMO_MAX_CTAS_PER_PAGE} CTAs.`);
    }
    if (page.mode === "code" && page.code) {
      if (!page.code.html || !page.code.html.trim()) {
        errors.push(`Page "${page.key}" is in code mode but has no HTML.`);
      }
      const size = promoCodeByteSize(page.code);
      if (size > PROMO_CODE_MAX_BYTES) {
        errors.push(
          `Page "${page.key}"'s code (html+css+js) is ${size} bytes, over the ${PROMO_CODE_MAX_BYTES}-byte cap.`,
        );
      }
    }
    if (page.mode === "poster" && !page.poster?.src) {
      errors.push(`Page "${page.key}" is in poster mode but has no image.`);
    }
    if (page.mode === "canvas" && !(page.canvas?.elements?.length)) {
      errors.push(`Page "${page.key}" is in canvas mode but has no elements.`);
    }
  }

  for (const cta of collectAllCtas(design)) {
    if (cta.action === "link" && !cta.url) {
      errors.push(`CTA "${cta.label}" (${cta.id}) has action=link but no url.`);
    }
    if (cta.action === "goto_page") {
      if (!cta.targetPageKey) {
        errors.push(`CTA "${cta.label}" (${cta.id}) has action=goto_page but no targetPageKey.`);
      } else if (!keys.includes(cta.targetPageKey)) {
        errors.push(
          `CTA "${cta.label}" (${cta.id}) targets page "${cta.targetPageKey}", which does not exist on this promotion.`,
        );
      }
    }
    // Sane requireField combinations: newsletter/waitlist mint a subscriber
    // record that is meaningless without an email — 'none' or 'phone' here
    // is always a mistake, not a legitimate design choice (unlike
    // claim/book_now, where requireField:'none' is the normal shape for the
    // Founding Member templates).
    if ((cta.action === "newsletter" || cta.action === "waitlist") && cta.requireField !== "email") {
      errors.push(
        `CTA "${cta.label}" (${cta.id}) has action=${cta.action}, which requires requireField="email".`,
      );
    }
  }

  return errors;
}
