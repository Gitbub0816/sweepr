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
 * Promotions engine.
 *
 * A promotion is one designed page (PowerPoint-style single slide) rendered by
 * the shared PromoWidget, plus a templated CTA, display rules, and expiry. Every
 * behavior lives on the `promotions` row so a promo is fully self-contained —
 * addressable by a public slug URL and embeddable on the marketing site.
 *
 * Templates: the catalog below is the source of truth for reusable designs
 * (including the Founding Member funnels for cleaners AND customers). Calling
 * `seedTemplatePromotions` writes any missing template into the DB as a draft
 * promotion automatically — adding a template needs zero extra wiring.
 */

import type { Sql } from "./db";
import { enroll as enrollFounding, type FoundingAudience } from "./foundingMember";

export type PromoAudience = "all" | "visitors" | "customers" | "cleaners";
export type PromoStatus = "draft" | "active" | "paused" | "expired" | "archived";

/** One block in the single-page design. Rendered top-to-bottom by PromoWidget. */
export interface PromoBlock {
  type: "badge" | "heading" | "subheading" | "text" | "image" | "divider" | "spacer" | "bullets";
  text?: string;
  src?: string; // image
  alt?: string;
  items?: string[]; // bullets
  align?: "left" | "center" | "right";
  size?: "sm" | "md" | "lg" | "xl";
}

export interface PromoDesign {
  theme?: "light" | "dark" | "brand";
  background?: string; // css color or gradient
  accent?: string;
  blocks: PromoBlock[];
}

export interface PromoCTA {
  label: string;
  action: "claim" | "link" | "dismiss";
  url?: string; // for action=link
  requireField?: "none" | "email" | "phone";
  successMessage?: string;
}

export interface PromoDisplay {
  placement: "modal" | "banner" | "inline";
  pages?: string[]; // path prefixes; empty = all
  delaySeconds?: number; // seconds after first visit before showing
  persist?: boolean; // show again on later visits?
  frequency?: "once" | "every_visit" | "daily"; // how often when persist
  showOnFirstVisit?: boolean;
}

export interface PromoTemplate {
  templateKey: string;
  name: string;
  audience: PromoAudience;
  grantsFoundingMember: boolean;
  design: PromoDesign;
  cta: PromoCTA;
  display: PromoDisplay;
}

/** slug is derived from the template key so re-seeding is idempotent. */
export function templateSlug(templateKey: string): string {
  return templateKey.replace(/_/g, "-");
}

// ─── Template catalog ────────────────────────────────────────────────────────
// Add an entry here and it auto-materializes as a draft promotion in the DB.
export const PROMO_TEMPLATES: PromoTemplate[] = [
  {
    templateKey: "founding_member_cleaner",
    name: "Founding Member — Cleaners",
    audience: "cleaners",
    grantsFoundingMember: true,
    design: {
      theme: "brand",
      accent: "#0f766e",
      blocks: [
        { type: "badge", text: "🏅 Founding Member", align: "center" },
        { type: "heading", text: "Become a Sweepr Founding Member", align: "center", size: "xl" },
        {
          type: "text",
          align: "center",
          text: "Join the earliest cleaning professionals building Sweepr. Founding Members keep a permanent 5% earnings bonus, a lifetime badge, early access to new features, and priority support.",
        },
        {
          type: "bullets",
          items: [
            "Permanent 5% earnings bonus on every job",
            "Lifetime Founding Member badge & founder number",
            "Early access to new features and earning opportunities",
            "Priority support",
          ],
        },
      ],
    },
    cta: {
      label: "Claim Founding Member status",
      action: "claim",
      requireField: "none",
      successMessage:
        "You're officially a Sweepr Founding Member. Your badge and benefits are now active.",
    },
    display: {
      placement: "modal",
      delaySeconds: 2,
      persist: true,
      frequency: "daily",
      showOnFirstVisit: true,
    },
  },
  {
    templateKey: "founding_member_customer",
    name: "Founding Member — Customers",
    audience: "customers",
    grantsFoundingMember: true,
    design: {
      theme: "brand",
      accent: "#0f766e",
      blocks: [
        { type: "badge", text: "🏅 Founding Member", align: "center" },
        { type: "heading", text: "You're early — become a Founding Member", align: "center", size: "xl" },
        {
          type: "text",
          align: "center",
          text: "Thank you for believing in Sweepr from the beginning. Founding Member customers get a permanent badge, early access to new services, and priority support for life while in good standing.",
        },
        {
          type: "bullets",
          items: [
            "Lifetime Founding Member badge & founder number",
            "Early access to new services and features",
            "Priority support",
          ],
        },
      ],
    },
    cta: {
      label: "Claim Founding Member status",
      action: "claim",
      requireField: "none",
      successMessage:
        "Welcome, Founding Member! Your status and benefits are now on your account.",
    },
    display: {
      placement: "modal",
      delaySeconds: 3,
      persist: true,
      frequency: "daily",
      showOnFirstVisit: true,
    },
  },
  {
    templateKey: "lead_capture",
    name: "Lead Capture (email)",
    audience: "visitors",
    grantsFoundingMember: false,
    design: {
      theme: "light",
      blocks: [
        { type: "heading", text: "Be first to know", align: "center", size: "lg" },
        { type: "text", align: "center", text: "Drop your email and we'll keep you posted on launch and offers." },
      ],
    },
    cta: {
      label: "Notify me",
      action: "claim",
      requireField: "email",
      successMessage: "You're on the list — talk soon!",
    },
    display: {
      placement: "modal",
      delaySeconds: 8,
      persist: false,
      frequency: "once",
      showOnFirstVisit: true,
    },
  },
];

export function getTemplate(templateKey: string): PromoTemplate | undefined {
  return PROMO_TEMPLATES.find((t) => t.templateKey === templateKey);
}

/**
 * Materialize every catalog template that isn't already in the DB as a draft
 * promotion. Idempotent (ON CONFLICT slug DO NOTHING). Safe to call on boot /
 * whenever the admin promotions page loads.
 */
export async function seedTemplatePromotions(sql: Sql): Promise<void> {
  for (const t of PROMO_TEMPLATES) {
    const slug = templateSlug(t.templateKey);
    await sql`
      INSERT INTO promotions (slug, name, template_key, audience, status, design, cta, display, grants_founding_member)
      VALUES (
        ${slug}, ${t.name}, ${t.templateKey}, ${t.audience}, 'draft',
        ${JSON.stringify(t.design)}::jsonb, ${JSON.stringify(t.cta)}::jsonb,
        ${JSON.stringify(t.display)}::jsonb, ${t.grantsFoundingMember}
      )
      ON CONFLICT (slug) DO NOTHING
    `;
  }
}

export interface PromotionRow {
  id: string;
  slug: string;
  name: string;
  template_key: string | null;
  audience: PromoAudience;
  status: PromoStatus;
  design: PromoDesign;
  cta: PromoCTA;
  display: PromoDisplay;
  starts_at: string | null;
  expires_at: string | null;
  max_claims: number | null;
  claim_count: number;
  view_count: number;
  grants_founding_member: boolean;
}

/** True when a promo is live right now (status + time window + claim cap). */
export function isLive(p: PromotionRow, now = Date.now()): boolean {
  if (p.status !== "active") return false;
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return false;
  if (p.expires_at && new Date(p.expires_at).getTime() <= now) return false;
  if (p.max_claims !== null && p.claim_count >= p.max_claims) return false;
  return true;
}

export async function getPromotionBySlug(sql: Sql, slug: string): Promise<PromotionRow | null> {
  const rows = (await sql`
    SELECT * FROM promotions WHERE slug = ${slug} LIMIT 1
  `) as PromotionRow[];
  return rows[0] ?? null;
}

/** Active promos an anonymous/authenticated visitor of a given persona may see. */
export async function listLivePromotions(
  sql: Sql,
  persona: "visitor" | "customer" | "cleaner",
): Promise<PromotionRow[]> {
  const audiences: PromoAudience[] =
    persona === "cleaner"
      ? ["all", "cleaners"]
      : persona === "customer"
        ? ["all", "customers"]
        : ["all", "visitors"];
  const rows = (await sql`
    SELECT * FROM promotions
    WHERE status = 'active' AND audience = ANY(${audiences})
    ORDER BY created_at DESC
  `) as PromotionRow[];
  return rows.filter((p) => isLive(p));
}

export async function recordImpression(sql: Sql, id: string): Promise<void> {
  await sql`UPDATE promotions SET view_count = view_count + 1 WHERE id = ${id}`;
}

export interface ClaimInput {
  email?: string;
  phone?: string;
  userId?: string | null;
  ip?: string;
}

export interface ClaimResult {
  status: "claimed" | "already_claimed" | "not_live" | "invalid_field" | "founding_granted";
  message?: string;
  grantedFounding?: boolean;
  founderId?: number;
}

/**
 * Claim a promotion. Enforces live-status, required-field validation, and
 * per-(promo,email)/(promo,user) dedup. When the promo grants Founding Member
 * status and an authenticated user claims it, the claimant is enrolled for the
 * promo's audience. Claim-count expiry is applied here so the promo self-closes.
 */
export async function claimPromotion(
  sql: Sql,
  slug: string,
  input: ClaimInput,
): Promise<ClaimResult> {
  const promo = await getPromotionBySlug(sql, slug);
  if (!promo || !isLive(promo)) return { status: "not_live" };

  const require = promo.cta.requireField ?? "none";
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  if (require === "email" && !email) return { status: "invalid_field", message: "Email required" };
  if (require === "phone" && !phone) return { status: "invalid_field", message: "Phone required" };

  const fieldValue = require === "email" ? email : require === "phone" ? phone : null;

  // Insert the claim; unique indexes dedupe by email or user per promo.
  let inserted = false;
  try {
    const rows = (await sql`
      INSERT INTO promotion_claims (promotion_id, user_id, email, phone, field_value, ip)
      VALUES (${promo.id}, ${input.userId ?? null}, ${email}, ${phone}, ${fieldValue}, ${input.ip ?? null})
      RETURNING id
    `) as Array<{ id: string }>;
    inserted = rows.length > 0;
  } catch {
    return { status: "already_claimed", message: "You've already claimed this." };
  }
  if (!inserted) return { status: "already_claimed" };

  // Bump claim_count and auto-expire if the cap is now reached.
  await sql`
    UPDATE promotions
    SET claim_count = claim_count + 1,
        status = CASE WHEN max_claims IS NOT NULL AND claim_count + 1 >= max_claims
                      THEN 'expired' ELSE status END,
        updated_at = NOW()
    WHERE id = ${promo.id}
  `;

  // Founding Member grant (authenticated claim only).
  if (promo.grants_founding_member && input.userId) {
    const audience: FoundingAudience | null =
      promo.audience === "cleaners" ? "cleaner" : promo.audience === "customers" ? "customer" : null;
    if (audience) {
      const idRows = (await sql`
        SELECT
          (SELECT cl.id FROM cleaners  cl WHERE cl.user_id = ${input.userId} LIMIT 1) AS cleaner_id,
          (SELECT cu.id FROM customers cu WHERE cu.user_id = ${input.userId} LIMIT 1) AS customer_id
      `) as Array<{ cleaner_id: string | null; customer_id: string | null }>;
      const targetId = audience === "cleaner" ? idRows[0]?.cleaner_id : idRows[0]?.customer_id;
      if (targetId) {
        const res = await enrollFounding(sql, audience, targetId, { force: false });
        if (res.status === "granted" || res.status === "already_member") {
          await sql`UPDATE promotion_claims SET granted_founding = TRUE
                    WHERE promotion_id = ${promo.id} AND user_id = ${input.userId}`;
          return {
            status: "founding_granted",
            message: promo.cta.successMessage,
            grantedFounding: true,
            founderId: res.founderId,
          };
        }
      }
    }
  }

  return { status: "claimed", message: promo.cta.successMessage };
}

/** Cron sweep: flip time-expired active promos to 'expired'. */
export async function expireDuePromotions(sql: Sql): Promise<number> {
  const rows = (await sql`
    UPDATE promotions
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'active'
      AND (
        (expires_at IS NOT NULL AND expires_at <= NOW())
        OR (max_claims IS NOT NULL AND claim_count >= max_claims)
      )
    RETURNING id
  `) as Array<{ id: string }>;
  return rows.length;
}
