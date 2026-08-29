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

/**
 * Maps router.
 *
 * Formerly minted short-lived Apple MapKit JS auth tokens (`/apple-token`).
 * The frontends now use Mapbox GL JS with a public access token baked in at
 * build time (`VITE_MAPBOX_TOKEN`), so there is no server-side token to sign
 * and this router has no endpoints. Kept (mounted) as a stable seam for any
 * future server-mediated maps concern.
 */
export const mapsRouter = new Hono<AppBindings>();

mapsRouter.get("/health", (c) => c.json({ ok: true }));
