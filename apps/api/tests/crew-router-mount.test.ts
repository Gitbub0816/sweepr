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
 * Regression test for a production incident: crewRouter is mounted at the app
 * root (`app.route("/", crewRouter)`, index.ts — its own paths are already
 * absolute: /bookings/:id/crew, /crew/*). It used to gate itself with
 * `crewRouter.use("*", requireAuth)`. In Hono, a sub-router's `.use()` pattern
 * is rewritten by prefixing it with the router's mount base; "/" + "*"
 * collapses to an unscoped "*", so that line silently became a GLOBAL
 * middleware across the ENTIRE composed app — every other router mounted
 * after it (calendar availability, service-area check, status, etc.) started
 * 401ing "Missing bearer token" even though none of them call requireAuth
 * themselves. Fixed by scoping crewRouter's auth to its own two path
 * families. This test builds a tiny app that mirrors the real mount order
 * (crewRouter first, an unrelated public router after) and asserts the leak
 * can't recur, without needing DATABASE_URL/KV — requireAuth's missing-header
 * check returns before touching either.
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { crewRouter } from "../src/routes/crew";
import type { AppBindings } from "../src/types";

function buildAppLikeIndexTs() {
  const app = new Hono<AppBindings>();
  // Mirrors index.ts: crewRouter mounted at root, then an unrelated router
  // mounted afterward — exactly the ordering that leaked in production.
  app.route("/", crewRouter);
  const publicRouter = new Hono<AppBindings>();
  publicRouter.get("/availability", (c) => c.json({ days: [] }));
  app.route("/calendar", publicRouter);
  return app;
}

describe("crewRouter mount does not leak auth onto other routers", () => {
  it("a router mounted after crewRouter stays public", async () => {
    const app = buildAppLikeIndexTs();
    const res = await app.request("/calendar/availability");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ days: [] });
  });

  it("crewRouter's own /bookings/:id/crew still requires auth", async () => {
    const app = buildAppLikeIndexTs();
    const res = await app.request("/bookings/abc/crew");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Missing bearer token" });
  });

  it("crewRouter's own /crew/* still requires auth", async () => {
    const app = buildAppLikeIndexTs();
    const res = await app.request("/crew/some-assignment/accept", { method: "POST" });
    expect(res.status).toBe(401);
  });
});
