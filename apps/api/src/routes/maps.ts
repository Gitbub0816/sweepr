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
import type { AppBindings } from "../types";
import { signAppleMapsToken, AppleMapsNotConfiguredError } from "../lib/appleMapsToken";

export const mapsRouter = new Hono<AppBindings>();

/**
 * Public endpoint consumed by mapkit.init's authorizationCallback in every
 * frontend app. Returns only a short-lived signed JWT — the Apple Maps
 * private key never leaves this Worker. No user auth required (this is the
 * same trust level as a public Mapbox token) but rate-limited like other
 * polled endpoints since mapkit re-calls this on token refresh.
 */
mapsRouter.get("/apple-token", async (c) => {
  try {
    const { token, expiresAt } = await signAppleMapsToken(c.env);
    return c.json({ token, expiresAt });
  } catch (err) {
    if (err instanceof AppleMapsNotConfiguredError) {
      return c.json({ error: "Apple Maps is not configured" }, 503);
    }
    throw err;
  }
});
