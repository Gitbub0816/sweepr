import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { getDb } from "../lib/db";
import { audit } from "../lib/audit";
import { createPresignedUploadUrl, parseR2Config } from "../lib/r2";
import { AppError } from "../lib/errors";
import type { AppBindings } from "../types";

export const insuranceRouter = new Hono<AppBindings>();

const INSURANCE_ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

// All routes require auth
insuranceRouter.use("*", requireAuth);

/** Slug + version of the consent document required for Sweepr Coverage. */
const INSURANCE_CONSENT_SLUG = "insurance-protection";
const INSURANCE_CONSENT_VERSION = "1.0";
const INSURANCE_CONSENT_LABEL =
  "I have read and agree to the Sweepr Insurance Protection Policy, and I authorize the monthly coverage fee to be deducted from my payouts.";

// GET /insurance/me — cleaner's current insurance record + enrollment prereqs
insuranceRouter.get("/me", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DATABASE_URL);

  const [cleaner] = await db`
    SELECT cl.id, cl.stripe_connect_id, u.id AS user_id
    FROM cleaners cl JOIN users u ON u.id = cl.user_id
    WHERE u.clerk_id = ${user.clerkId}
  `;
  if (!cleaner) return c.json({ insurance: null, stripeConnected: false, consentSigned: false });

  const [row] = await db`
    SELECT * FROM cleaner_insurance WHERE cleaner_id = ${cleaner.id}
  `;
  const [consent] = await db`
    SELECT id FROM legal_acceptances
    WHERE user_id = ${cleaner.user_id} AND document_slug = ${INSURANCE_CONSENT_SLUG}
    ORDER BY accepted_at DESC LIMIT 1
  `;

  return c.json({
    insurance: row ?? null,
    stripeConnected: !!cleaner.stripe_connect_id,
    consentSigned: !!consent,
  });
});

// POST /insurance/enroll-program — enroll in the Sweepr Coverage Program.
// Coverage through Sweepr is billed against payouts, so a Stripe Connect
// account is MANDATORY, and the cleaner must sign the Insurance Protection
// Policy consent (recorded in legal_acceptances with IP/UA) in the same
// request.
const enrollSchema = z.object({
  consentAccepted: z.literal(true),
});

insuranceRouter.post(
  "/enroll-program",
  zValidator("json", enrollSchema),
  async (c) => {
    const user = c.get("user");
    const db = getDb(c.env.DATABASE_URL);

    const [cleaner] = await db`
      SELECT cl.id, cl.stripe_connect_id, u.id AS user_id
      FROM cleaners cl
      JOIN users u ON u.id = cl.user_id
      WHERE u.clerk_id = ${user.clerkId} AND cl.status = 'approved'
    `;
    if (!cleaner) throw new AppError("NOT_FOUND", "Cleaner not found or not approved", 404);

    // Stripe Connect is mandatory for Sweepr-provided coverage — the monthly
    // fee is deducted from payouts, which requires a connected account.
    if (!cleaner.stripe_connect_id) {
      return c.json(
        { error: "stripe_required", message: "Set up payouts (Stripe) before enrolling in Sweepr Coverage." },
        409,
      );
    }

    // Consent insert + insurance upsert in a single CTE so they're atomic.
    const [ins] = await db`
      WITH consent AS (
        INSERT INTO legal_acceptances (
          user_id, document_slug, document_version, flow_context,
          ip_address, user_agent, checkbox_label_snapshot
        ) VALUES (
          ${cleaner.user_id}, ${INSURANCE_CONSENT_SLUG}, ${INSURANCE_CONSENT_VERSION},
          'insurance_enrollment',
          ${c.req.header("CF-Connecting-IP") ?? null}, ${c.req.header("User-Agent") ?? null},
          ${INSURANCE_CONSENT_LABEL}
        )
      )
      INSERT INTO cleaner_insurance (cleaner_id, coverage_type, policy_status)
      VALUES (${cleaner.id}, 'sweepr_program', 'active')
      ON CONFLICT (cleaner_id) DO UPDATE
      SET coverage_type = 'sweepr_program',
          program_active_since = COALESCE(cleaner_insurance.program_active_since, NOW()),
          policy_status = 'active',
          updated_at = NOW()
      RETURNING id
    `;

    await audit(db, {
      action: "cleaner.insurance_enrolled",
      actorClerkId: user.clerkId,
      targetType: "cleaner_insurance",
      targetId: ins.id,
      metadata: { event: "enrolled_sweepr_program", consentVersion: INSURANCE_CONSENT_VERSION },
      timestamp: new Date().toISOString(),
    });

    return c.json({ enrolled: true });
  },
);

// POST /insurance/upload-policy — cleaner uploads their own COI
const uploadSchema = z.object({
  policyNumber: z.string().min(1).optional(),
  insurerName: z.string().min(1).optional(),
  coverageAmountUsd: z.number().int().min(500000).optional(),
  policyExpiresAt: z.string().datetime().refine((v) => new Date(v) > new Date(), {
    message: "Policy expiry date must be in the future",
  }).optional(),
  fileName: z.string().min(1).max(255),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
});

insuranceRouter.post(
  "/upload-policy",
  zValidator("json", uploadSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const db = getDb(c.env.DATABASE_URL);

    const [cleaner] = await db`
      SELECT cl.id FROM cleaners cl
      JOIN users u ON u.id = cl.user_id
      WHERE u.clerk_id = ${user.clerkId} AND cl.status = 'approved'
    `;
    if (!cleaner) throw new AppError("NOT_FOUND", "Cleaner not found or not approved", 404);

    const cfg = parseR2Config(c.env as Parameters<typeof parseR2Config>[0]);
    const rawExt = input.fileName.split(".").pop()?.toLowerCase() ?? "";
    const ext = INSURANCE_ALLOWED_EXTS.has(rawExt) ? rawExt : "pdf";
    const objectKey = `insurance/${cleaner.id}/${Date.now()}.${ext}`;

    const { uploadUrl, storageKey } = await createPresignedUploadUrl(
      cfg,
      objectKey,
      input.contentType,
      600,
    );

    // Pre-create the record so the key is committed before the upload
    await db`
      INSERT INTO cleaner_insurance (
        cleaner_id, coverage_type, policy_status,
        policy_number, insurer_name, coverage_amount_usd, policy_expires_at,
        doc_storage_key, doc_uploaded_at
      ) VALUES (
        ${cleaner.id}, 'personal_policy', 'pending_review',
        ${input.policyNumber ?? null}, ${input.insurerName ?? null},
        ${input.coverageAmountUsd ?? null}, ${input.policyExpiresAt ?? null},
        ${storageKey}, NOW()
      )
      ON CONFLICT (cleaner_id) DO UPDATE SET
        coverage_type = 'personal_policy',
        policy_status = 'pending_review',
        policy_number = COALESCE(EXCLUDED.policy_number, cleaner_insurance.policy_number),
        insurer_name = COALESCE(EXCLUDED.insurer_name, cleaner_insurance.insurer_name),
        coverage_amount_usd = COALESCE(EXCLUDED.coverage_amount_usd, cleaner_insurance.coverage_amount_usd),
        policy_expires_at = COALESCE(EXCLUDED.policy_expires_at, cleaner_insurance.policy_expires_at),
        doc_storage_key = EXCLUDED.doc_storage_key,
        doc_uploaded_at = NOW(),
        review_notes = NULL,
        reviewed_by = NULL,
        reviewed_at = NULL,
        updated_at = NOW()
    `;

    return c.json({ uploadUrl, storageKey });
  }
);

// Admin routes — review personal policy submissions

export const insuranceAdminRouter = new Hono<AppBindings>();
insuranceAdminRouter.use("*", requireAuth);

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(1000).optional(),
});

// GET /admin/insurance — list pending policy reviews
insuranceAdminRouter.get("/", async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status") ?? "pending_review";

  // Include BOTH personal policies and Sweepr Coverage Program enrollments so the
  // admin view matches what cleaners see. (Only personal policies ever reach
  // 'pending_review'/'rejected'; program enrollments show as 'active'.)
  const rows = await db`
    SELECT ci.*, cl.first_name, cl.last_name, u.email
    FROM cleaner_insurance ci
    JOIN cleaners cl ON cl.id = ci.cleaner_id
    JOIN users u ON u.id = cl.user_id
    WHERE ci.policy_status = ${status}
    ORDER BY ci.doc_uploaded_at DESC NULLS LAST
  `;
  return c.json({ policies: rows });
});

// POST /admin/insurance/:cleanerId/review
insuranceAdminRouter.post(
  "/:cleanerId/review",
  zValidator("json", reviewSchema),
  async (c) => {
    const adminUser = c.get("user");
    const { cleanerId } = c.req.param();
    const { decision, note } = c.req.valid("json");
    const db = getDb(c.env.DATABASE_URL);

    const newStatus = decision === "approved" ? "active" : "rejected";

    const [prev] = await db`SELECT policy_status FROM cleaner_insurance WHERE cleaner_id = ${cleanerId}`;
    if (!prev) throw new AppError("NOT_FOUND", "Insurance record not found", 404);

    await db`
      UPDATE cleaner_insurance SET
        policy_status = ${newStatus},
        review_notes = ${note ?? null},
        reviewed_by = ${adminUser.clerkId},
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE cleaner_id = ${cleanerId}
    `;

    await db`
      INSERT INTO insurance_status_log (cleaner_id, previous_status, new_status, changed_by, note)
      VALUES (${cleanerId}, ${prev.policy_status}, ${newStatus}, ${adminUser.clerkId}, ${note ?? null})
    `;

    await audit(db, {
      action: "admin.action",
      actorClerkId: adminUser.clerkId,
      targetType: "cleaner_insurance",
      targetId: cleanerId,
      metadata: { decision, previousStatus: prev.policy_status, newStatus },
      timestamp: new Date().toISOString(),
    });

    return c.json({ ok: true, status: newStatus });
  }
);
