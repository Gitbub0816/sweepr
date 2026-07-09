/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createPresignedUploadUrl, parseR2Config, parseR2LegalConfig } from "../lib/r2";
import { requireAuth } from "../middleware/auth";
import { MAX_UPLOAD_BYTES } from "../lib/constants";
import { getDb } from "../lib/db";
import { getUserByClerkId, getCleanerByUserId } from "@sweepr/db";
import { getBookingAuthCtx, canUploadPhotos } from "../lib/bookingAuthorization";
import { isOwnerClerkId } from "../lib/owner";
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
    const clerkId = c.get("user").clerkId;
    const sql = getDb(c.env.DATABASE_URL);

    // Scope refId to the caller — otherwise any authenticated user could mint
    // an upload URL under someone else's booking/cleaner id (IDOR).
    if (input.scope === "booking") {
      const ctx = await getBookingAuthCtx(sql, input.refId, clerkId);
      if (!ctx || !canUploadPhotos(ctx)) {
        return c.json({ error: "Booking not found" }, 404);
      }
    } else if (input.scope === "avatar" || input.scope === "certificate" || input.scope === "insurance") {
      // These are cleaner-owned assets — refId must be the caller's own cleaner id.
      const isOwner = isOwnerClerkId(clerkId, c.env);
      if (!isOwner) {
        const user = await getUserByClerkId(sql, clerkId);
        const cleaner = user ? await getCleanerByUserId(sql, user.id) : null;
        const isAdmin = user?.role === "admin" || user?.role === "super_admin";
        if (!isAdmin && (!cleaner || cleaner.id !== input.refId)) {
          return c.json({ error: "Forbidden" }, 403);
        }
      }
    } else if (input.scope === "training") {
      // Training assets are admin-authored content.
      const isOwner = isOwnerClerkId(clerkId, c.env);
      if (!isOwner) {
        const user = await getUserByClerkId(sql, clerkId);
        if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
          return c.json({ error: "Forbidden" }, 403);
        }
      }
    }

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

    const { uploadUrl, storageKey, contentType } = await createPresignedUploadUrl(
      cfg,
      objectKey,
      input.contentType,
    );

    // Tell the client which public base URL to use for reading the file back.
    // `requiredHeaders` is the Content-Type bound into the presigned signature —
    // the client MUST send exactly this on its PUT or R2 rejects the upload,
    // which prevents swapping in an arbitrary (e.g. text/html) content type.
    return c.json({
      uploadUrl,
      storageKey,
      publicUrl: `${cfg.publicUrlBase}/${storageKey}`,
      bucket: cfg.bucket,
      contentType,
      requiredHeaders: { "Content-Type": contentType },
    });
  }
);
