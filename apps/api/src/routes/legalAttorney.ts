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
 * External reviewing attorney portal API. An outside-counsel attorney signs
 * in with a signed, single-use magic link, then views / edits / approves the
 * archived legal document snapshots in the sweepr-legal R2 bucket. Fully
 * isolated from the staff admin Clerk app — this is one reviewer, not an
 * operator. Admin sub-routes (staff-only) manage the attorney roster.
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { audit } from "../lib/audit";
import { sendEmail, SENDERS, wrapBodyInTemplate } from "../lib/mailer";
import { parseR2LegalConfig, putObjectR2 } from "../lib/r2";
import {
  getActiveAttorneyByEmail,
  getAttorneyById,
  createAttorneyLoginToken,
  claimAttorneyLoginToken,
  mintAttorneySession,
  verifyAttorneySession,
  listAttorneys,
  upsertAttorney,
  approveDocVersion,
  markDocEdited,
  type LegalAttorney,
} from "../lib/legalAttorney";
import { getCurrentLegalDocVersion, legalArchiveR2Prefix } from "../lib/legalArchive";
import type { AppBindings } from "../types";

export const legalAttorneyRouter = new Hono<AppBindings>();

const LEGAL_APP_URL = "https://legal.getsweepr.com";

// Resolve the signed-in attorney from the Bearer token, or null.
async function resolveAttorney(c: Context<AppBindings>): Promise<LegalAttorney | null> {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const attorneyId = await verifyAttorneySession(c.env, auth.slice(7));
  if (!attorneyId) return null;
  const sql = getDb(c.env.DATABASE_URL);
  const attorney = await getAttorneyById(sql, attorneyId);
  return attorney?.active ? attorney : null;
}

// ── Sign-in (magic link) ────────────────────────────────────────────────────

legalAttorneyRouter.post("/request-link", zValidator("json", z.object({ email: z.string().email() })), async (c) => {
  const { email } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const attorney = await getActiveAttorneyByEmail(sql, email);
  // Always 200 — never reveal whether an address is a registered attorney.
  if (attorney) {
    const raw = await createAttorneyLoginToken(sql, attorney.id);
    const link = `${LEGAL_APP_URL}/attorney/verify?token=${raw}`;
    const body = `
      <p>Hello ${attorney.fullName},</p>
      <p>Use the secure link below to sign in to the Sweepr legal document review portal.
      This link is single-use and expires in 30 minutes.</p>
    `;
    await sendEmail(
      c.env.MAILERSEND_API_KEY,
      {
        to: attorney.email,
        toName: attorney.fullName,
        subject: "Your Sweepr legal review sign-in link",
        html: wrapBodyInTemplate("Sign in to the legal review portal", body, undefined, {
          cta: { label: "Sign in", url: link },
        }),
        from: SENDERS.ADMIN,
        replyTo: { email: "legal@getsweepr.com", name: "Sweepr Legal" },
        category: "transactional",
        relatedType: "legal_attorney",
        relatedId: attorney.id,
        templateName: "legal_attorney_login",
      },
      sql,
    );
  }
  return c.json({ ok: true });
});

legalAttorneyRouter.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Missing token" }, 400);
  const sql = getDb(c.env.DATABASE_URL);
  const attorneyId = await claimAttorneyLoginToken(sql, token);
  if (!attorneyId) return c.json({ error: "Invalid or expired link" }, 401);
  const session = await mintAttorneySession(c.env, attorneyId);
  return c.json({ session });
});

legalAttorneyRouter.get("/me", async (c) => {
  const attorney = await resolveAttorney(c);
  if (!attorney) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ attorney });
});

// ── Documents ───────────────────────────────────────────────────────────────

legalAttorneyRouter.get("/documents", async (c) => {
  const attorney = await resolveAttorney(c);
  if (!attorney) return c.json({ error: "Unauthorized" }, 401);
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT slug, version, title, category, r2_prefix, attorney_approved_at, attorney_name, edited_html_at
    FROM legal_document_versions WHERE is_current = TRUE ORDER BY category, title
  `) as Array<Record<string, unknown>>;
  return c.json({ documents: rows });
});

legalAttorneyRouter.get("/documents/:slug", async (c) => {
  const attorney = await resolveAttorney(c);
  if (!attorney) return c.json({ error: "Unauthorized" }, 401);
  const sql = getDb(c.env.DATABASE_URL);
  const current = await getCurrentLegalDocVersion(sql, c.req.param("slug"));
  if (!current) return c.json({ error: "Not found" }, 404);
  const r2 = parseR2LegalConfig(c.env);
  const htmlUrl = `${r2.publicUrlBase}/${current.r2Prefix}/document.html`;
  let html = "";
  try {
    const res = await fetch(htmlUrl);
    if (res.ok) html = await res.text();
  } catch {
    html = "";
  }
  return c.json({ version: current, html, htmlUrl });
});

legalAttorneyRouter.put(
  "/documents/:slug",
  zValidator("json", z.object({ html: z.string().min(1) })),
  async (c) => {
    const attorney = await resolveAttorney(c);
    if (!attorney) return c.json({ error: "Unauthorized" }, 401);
    const slug = c.req.param("slug");
    const sql = getDb(c.env.DATABASE_URL);
    const current = await getCurrentLegalDocVersion(sql, slug);
    if (!current) return c.json({ error: "Not found" }, 404);
    const r2 = parseR2LegalConfig(c.env);
    const prefix = current.r2Prefix || legalArchiveR2Prefix(slug, current.version);
    await putObjectR2(r2, `${prefix}/document.html`, c.req.valid("json").html, "text/html; charset=utf-8");
    await markDocEdited(sql, slug);
    await audit(sql, {
      action: "legal.attorney_edit",
      actorClerkId: `attorney:${attorney.id}`,
      targetType: "legal_document_version",
      targetId: `${slug}@${current.version}`,
      metadata: { attorney: attorney.fullName, barNumber: attorney.barNumber },
      timestamp: new Date().toISOString(),
    });
    return c.json({ ok: true });
  },
);

legalAttorneyRouter.post("/documents/:slug/approve", async (c) => {
  const attorney = await resolveAttorney(c);
  if (!attorney) return c.json({ error: "Unauthorized" }, 401);
  const slug = c.req.param("slug");
  const sql = getDb(c.env.DATABASE_URL);
  const ok = await approveDocVersion(sql, slug, attorney);
  if (!ok) return c.json({ error: "Not found" }, 404);
  await audit(sql, {
    action: "legal.attorney_approve",
    actorClerkId: `attorney:${attorney.id}`,
    targetType: "legal_document_version",
    targetId: slug,
    metadata: { attorney: attorney.fullName, barNumber: attorney.barNumber, barState: attorney.barState },
    timestamp: new Date().toISOString(),
  });
  return c.json({ ok: true });
});

// ── Admin: manage the attorney roster ────────────────────────────────────────

const adminAttorneyRouter = new Hono<AppBindings>();
adminAttorneyRouter.use("*", requireAuth, requireAdmin);

adminAttorneyRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  return c.json({ attorneys: await listAttorneys(sql) });
});

const attorneySchema = z.object({
  email: z.string().email(),
  fullName: z.string().trim().min(1),
  barNumber: z.string().trim().nullable().optional(),
  barState: z.string().trim().max(2).nullable().optional(),
  firmName: z.string().trim().nullable().optional(),
  title: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  active: z.boolean().default(true),
});

adminAttorneyRouter.put("/", zValidator("json", attorneySchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const attorney = await upsertAttorney(sql, {
    email: input.email,
    fullName: input.fullName,
    barNumber: input.barNumber ?? null,
    barState: input.barState ?? null,
    firmName: input.firmName ?? null,
    title: input.title ?? null,
    phone: input.phone ?? null,
    active: input.active,
  });
  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "legal_attorney",
    targetId: attorney.id,
    metadata: { email: attorney.email, active: attorney.active },
    timestamp: new Date().toISOString(),
  });
  return c.json({ attorney });
});

legalAttorneyRouter.route("/admin/attorneys", adminAttorneyRouter);
