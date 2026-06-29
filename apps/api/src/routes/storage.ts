import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createPresignedUploadUrl, parseR2Config, parseR2LegalConfig } from "../lib/r2";
import { requireAuth } from "../middleware/auth";
import { MAX_UPLOAD_BYTES } from "../lib/constants";
import type { AppBindings } from "../types";

export const storageRouter = new Hono<AppBindings>();

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);

// Scopes that go to sweepr-legal (WORM bucket, 7-year retention).
const LEGAL_SCOPES = new Set(["certificate", "insurance"]);

const signSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  purpose: z.enum([
    "booking_photo",
    "cleaner_avatar",
    "training_asset",
    "certificate",
    "insurance_doc",
  ]),
  scope: z.enum(["booking", "avatar", "training", "certificate", "insurance"]),
  refId: z.string().uuid(),
});

storageRouter.post(
  "/sign-upload",
  requireAuth,
  zValidator("json", signSchema),
  async (c) => {
    const input = c.req.valid("json");

    const prefix = {
      booking: "bookings",
      avatar: "avatars",
      training: "training",
      certificate: "certificates",
      insurance: "insurance",
    }[input.scope];

    const rawExt = input.fileName.split(".").pop()?.toLowerCase() ?? "";
    const ext = ALLOWED_EXTS.has(rawExt) ? rawExt : "jpg";
    const objectKey = `${prefix}/${input.refId}/${Date.now()}.${ext}`;

    // Legal docs (certificates, insurance) go to the WORM-locked sweepr-legal bucket.
    // Everything else goes to sweepr (objects.getsweepr.com).
    const cfg = LEGAL_SCOPES.has(input.scope)
      ? parseR2LegalConfig(c.env)
      : parseR2Config(c.env as Parameters<typeof parseR2Config>[0]);

    const { uploadUrl, storageKey } = await createPresignedUploadUrl(
      cfg,
      objectKey,
      input.contentType,
    );

    // Tell the client which public base URL to use for reading the file back.
    return c.json({
      uploadUrl,
      storageKey,
      publicUrl: `${cfg.publicUrlBase}/${storageKey}`,
      bucket: cfg.bucket,
    });
  }
);
