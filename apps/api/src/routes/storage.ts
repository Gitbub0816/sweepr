import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createSignedUploadUrl,
  parseServiceAccount,
} from "../lib/firebase";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";

export const storageRouter = new Hono<AppBindings>();

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_BYTES = 10 * 1024 * 1024;

const signSchema = z.object({
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  scope: z.enum(["booking", "avatar"]),
  refId: z.string(),
});

storageRouter.post(
  "/sign-upload",
  requireAuth,
  zValidator("json", signSchema),
  async (c) => {
    const input = c.req.valid("json");
    if (!ALLOWED_TYPES.includes(input.contentType)) {
      return c.json({ error: "Unsupported file type" }, 400);
    }
    if (input.sizeBytes > MAX_BYTES) {
      return c.json({ error: "File exceeds 10MB limit" }, 400);
    }

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
