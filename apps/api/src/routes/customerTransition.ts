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
 * Customer → Business transition initiation (spec §4.3).
 *
 * Mounted at /account/business-transition on the CUSTOMER app surface: a
 * signed-in customer starts the bridge here, then finishes it in the Business
 * app (which claims the token via POST /business/transitions/complete).
 *
 * The raw token is returned exactly once inside `transitionUrl` and is never
 * logged or stored — only its sha256 hash lives in cross_app_transitions.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { requireAuth, requireApp } from "../middleware/auth";
import { resolveIdentity } from "../lib/identity";
import { createTransition, TransitionError } from "../lib/transitions";
import { audit } from "../lib/audit";
import type { AppBindings } from "../types";

export const customerTransitionRouter = new Hono<AppBindings>();
customerTransitionRouter.use("*", requireAuth, requireApp("customer"));

const startTransitionSchema = z
  .object({
    type: z.enum(["create_business_workspace", "convert_customer_to_business"]),
    workspaceName: z.string().trim().min(1).max(120),
    legalName: z.string().trim().min(1).max(200).optional(),
    businessType: z.string().trim().min(1).max(80).optional(),
    mode: z.enum(["full", "partition"]).optional(),
    addressIds: z.array(z.string().uuid()).min(1).max(500).optional(),
  })
  .strict()
  .refine((b) => b.type !== "convert_customer_to_business" || Boolean(b.mode), {
    message: "mode is required for convert_customer_to_business",
    path: ["mode"],
  });

customerTransitionRouter.post("/", zValidator("json", startTransitionSchema), async (c) => {
  const body = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const resolved = await resolveIdentity(sql, c.get("authApp"), c.get("providerUserId"), {
    email: c.get("user").email,
  });
  if (!resolved) return c.json({ error: "Identity not resolvable" }, 403);

  const payload =
    body.type === "create_business_workspace"
      ? {
          workspaceName: body.workspaceName,
          legalName: body.legalName,
          businessType: body.businessType,
        }
      : {
          workspaceName: body.workspaceName,
          legalName: body.legalName,
          businessType: body.businessType,
          mode: body.mode as "full" | "partition",
          addressIds: body.mode === "partition" ? body.addressIds : undefined,
        };

  let created;
  try {
    created = await createTransition(sql, {
      sourceApplication: "customer",
      sourceAuthIdentityId: resolved.identity.id,
      targetApplication: "business",
      intendedPlatformPersonId: resolved.person.id,
      type: body.type,
      payload,
    });
  } catch (err) {
    if (err instanceof TransitionError) return c.json({ error: err.message }, 400);
    if (err instanceof z.ZodError) return c.json({ error: "Invalid transition payload" }, 400);
    throw err;
  }

  await audit(sql, {
    action: "workspace.transition_created",
    actorClerkId: c.get("user").clerkId,
    targetType: "cross_app_transition",
    targetId: created.transitionId,
    metadata: { type: body.type, mode: body.mode ?? null },
    ipAddress: c.req.header("cf-connecting-ip"),
    userAgent: c.req.header("user-agent"),
    timestamp: new Date().toISOString(),
  });

  return c.json({
    transitionUrl: `https://business.getsweepr.com/claim?token=${created.rawToken}`,
    expiresAt: created.expiresAt.toISOString(),
  });
});
