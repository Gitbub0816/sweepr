import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createSignedUploadUrl, parseServiceAccount } from "../lib/firebase";
import { requireAuth } from "../middleware/auth";
import { MAX_UPLOAD_BYTES } from "../lib/constants";
import type { AppBindings } from "../types";

export const storageRouter = new Hono<AppBindings>();

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const signSchema = z
  .object({
    fileName: z.string().min(1).max(255),
    contentType: z.enum(ALLOWED_TYPES),
    sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
    purpose: z.enum([
      "booking_photo",
      "cleaner_avatar",
      "id_front",
      "id_back",
      "selfie",
    ]),
    scope: z.enum(["booking", "avatar"]),
    bookingId: z.string().uuid().optional(),
    cleanerId: z.string().uuid().optional(),
    refId: z.string().uuid(),
  })
  .refine((v) => v.bookingId || v.cleanerId || v.refId, {
    message: "A bookingId or cleanerId is required",
  });

storageRouter.post(
  "/sign-upload",
  requireAuth,
  zValidator("json", signSchema),
  async (c) => {
    const input = c.req.valid("json");

    const account = parseServiceAccount(c.env.FIREBASE_SERVICE_ACCOUNT);
    const prefix = input.scope === "avatar" ? "avatars" : "bookings";
    const objectPath = `${prefix}/${input.refId}/${Date.now()}-${input.fileName}`;

    const { uploadUrl, publicUrl } = await createSignedUploadUrl(account, {
      bucket: "",
      objectPath,
      contentType: input.contentType,
    });

    return c.json({ uploadUrl, publicUrl });
  }
);
