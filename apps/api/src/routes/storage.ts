import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createPresignedUploadUrl, parseR2Config } from "../lib/r2";
import { requireAuth } from "../middleware/auth";
import { MAX_UPLOAD_BYTES } from "../lib/constants";
import type { AppBindings } from "../types";

export const storageRouter = new Hono<AppBindings>();

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

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
    const cfg = parseR2Config(c.env as Parameters<typeof parseR2Config>[0]);

    const prefix = {
      booking: "bookings",
      avatar: "avatars",
      training: "training",
      certificate: "certificates",
      insurance: "insurance",
    }[input.scope];

    const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "jpg";
    const objectKey = `${prefix}/${input.refId}/${Date.now()}.${ext}`;

    const { uploadUrl, storageKey } = await createPresignedUploadUrl(
      cfg,
      objectKey,
      input.contentType,
    );

    return c.json({ uploadUrl, storageKey });
  }
);
