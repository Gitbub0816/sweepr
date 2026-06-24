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

// All routes require auth
insuranceRouter.use("*", requireAuth);

// GET /insurance/me — cleaner's current insurance record
insuranceRouter.get("/me", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DATABASE_URL);

  const [row] = await db`
    SELECT ci.*
    FROM cleaner_insurance ci
    JOIN cleaners cl ON cl.id = ci.cleaner_id
    JOIN users u ON u.id = cl.user_id
    WHERE u.clerk_id = ${user.clerkId}
  `;

  if (!row) return c.json({ insurance: null });
  return c.json({ insurance: row });
});

// POST /insurance/enroll-program — subscribe to Sweepr Coverage Program
// (creates a Stripe subscription; client receives checkout URL)
insuranceRouter.post("/enroll-program", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DATABASE_URL);

  const [cleaner] = await db`
    SELECT cl.id FROM cleaners cl
    JOIN users u ON u.id = cl.user_id
    WHERE u.clerk_id = ${user.clerkId} AND cl.status = 'approved'
  `;
  if (!cleaner) throw new AppError("Cleaner not found or not approved", "NOT_FOUND", 404);

  // Upsert insurance record as sweepr_program
  const [ins] = await db`
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
    action: "admin.action",
    actorClerkId: user.clerkId,
    targetType: "cleaner_insurance",
    targetId: ins.id,
    metadata: { event: "enrolled_sweepr_program" },
    timestamp: new Date().toISOString(),
  });

  return c.json({ enrolled: true });
});

// POST /insurance/upload-policy — cleaner uploads their own COI
const uploadSchema = z.object({
  policyNumber: z.string().min(1).optional(),
  insurerName: z.string().min(1).optional(),
  coverageAmountUsd: z.number().int().positive().optional(),
  policyExpiresAt: z.string().datetime().optional(),
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
      WHERE u.clerk_id = ${user.clerkId}
    `;
    if (!cleaner) throw new AppError("Cleaner not found", "NOT_FOUND", 404);

    const cfg = parseR2Config(c.env as Parameters<typeof parseR2Config>[0]);
    const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "pdf";
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

  const rows = await db`
    SELECT ci.*, cl.first_name, cl.last_name, u.email
    FROM cleaner_insurance ci
    JOIN cleaners cl ON cl.id = ci.cleaner_id
    JOIN users u ON u.id = cl.user_id
    WHERE ci.coverage_type = 'personal_policy'
      AND ci.policy_status = ${status}
    ORDER BY ci.doc_uploaded_at DESC
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
    if (!prev) throw new AppError("Insurance record not found", "NOT_FOUND", 404);

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
