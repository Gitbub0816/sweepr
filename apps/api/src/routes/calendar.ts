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
 * Public booking-calendar availability.
 *
 *   GET /calendar/availability?from=YYYY-MM-DD&to=YYYY-MM-DD[&lat=&lng=]
 *
 * Powers the customer wizard's date picker: which dates are blocked, and
 * which carry an admin-configured price adjustment or automatic promotion —
 * as {date, blocked?, adjustmentLabel?, promoLabel?} entries, LABELS ONLY.
 * Internal reasons, rule values, and rule internals are never sent; blocked
 * dates carry no explanation at all. lat/lng (the wizard's picked address)
 * scope area-specific rules; without coordinates only platform-wide rules
 * are reported. Unauthenticated by design (same posture as
 * /service-areas/check — it reveals nothing a customer wouldn't see by
 * stepping through the wizard) with a generous read bucket in index.ts
 * (convention 14: the wizard refetches per month navigation, so never a
 * strict mutation bucket).
 *
 * ADVISORY ONLY: the server re-checks blocks and re-applies date pricing at
 * quote and booking creation (routes/bookings.ts) — hiding a date here is UX,
 * enforcement is there.
 */

import { Hono } from "hono";
import { getDb } from "../lib/db";
import { publicAvailability } from "../lib/calendarRules";
import { resolveServiceAreaId } from "../lib/serviceAreaGeo";
import type { AppBindings } from "../types";

export const calendarRouter = new Hono<AppBindings>();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 200;

calendarRouter.get("/availability", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || to < from) {
    return c.json({ error: "invalid_range", message: "Provide from and to as YYYY-MM-DD." }, 400);
  }
  const spanDays = (new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000;
  if (!Number.isFinite(spanDays) || spanDays > MAX_RANGE_DAYS) {
    return c.json({ error: "invalid_range", message: "Range too large." }, 400);
  }

  const lat = c.req.query("lat");
  const lng = c.req.query("lng");

  const sql = getDb(c.env.DATABASE_URL);
  const areaId = await resolveServiceAreaId(
    sql,
    lat != null ? Number(lat) : null,
    lng != null ? Number(lng) : null,
  );
  const days = await publicAvailability(sql, from, to, areaId);
  return c.json({ from, to, days });
});
