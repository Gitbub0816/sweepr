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
 * GET /auth/me — the identity check every app's nav (and both native apps'
 * SessionStore) polls.
 *
 * Regression context: production 500 "NeonDbError: column \"first_name\" does
 * not exist" — the enriched /me query selected first_name straight off `users`,
 * but `users` has NO name columns (001_initial.sql): names live on the role
 * tables (`customers`, `cleaners`). The fake sql here is schema-faithful — any
 * query that reads name columns from `users` without joining a role table
 * throws exactly like production did, so reintroducing the drift fails loudly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

interface Recorded {
  text: string;
  values: unknown[];
}

let currentHandler: (text: string, values: unknown[]) => unknown = () => [];
const calls: Recorded[] = [];
const fakeSql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
  const text = strings.join("?");
  calls.push({ text, values });
  // Schema guard: `users` has no first_name/last_name. A query that mentions
  // them while selecting FROM users and never joining customers/cleaners is
  // the exact production bug — reproduce the production failure.
  if (
    /first_name|last_name/.test(text) &&
    /FROM\s+users/i.test(text) &&
    !/JOIN\s+(customers|cleaners)/i.test(text)
  ) {
    throw new Error('column "first_name" does not exist');
  }
  return Promise.resolve(currentHandler(text, values) ?? []);
}) as unknown as import("../src/lib/db").Sql;

let authed = true;
vi.mock("../src/lib/db", () => ({ getDb: () => fakeSql }));
vi.mock("../src/middleware/auth", () => ({
  requireAuth: async (
    c: { set: (k: string, v: unknown) => void; json: (b: unknown, s: number) => Response },
    next: () => Promise<void>,
  ) => {
    if (!authed) return c.json({ error: "Unauthorized" }, 401);
    c.set("user", { clerkId: "clerk_caller", email: "caleb@example.com" });
    await next();
  },
}));

import { authRouter } from "../src/routes/auth";

function buildApp() {
  const app = new Hono();
  app.route("/auth", authRouter);
  return app;
}

const ENV = { DATABASE_URL: "postgres://fake" };

beforeEach(() => {
  calls.length = 0;
  authed = true;
  currentHandler = () => [];
});

describe("GET /auth/me", () => {
  it("returns the enriched identity with names sourced from the role tables", async () => {
    currentHandler = () => [
      {
        id: "user_1",
        email: "caleb@example.com",
        role: "customer",
        first_name: "Caleb",
        last_name: "O",
      },
    ];
    const res = await buildApp().request("/auth/me", {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(body.user).toEqual({
      clerkId: "clerk_caller",
      email: "caleb@example.com",
      userId: "user_1",
      firstName: "Caleb",
      lastName: "O",
      role: "customer",
    });
    // The query must resolve names via the role tables, keyed by clerk_id.
    const me = calls[0];
    expect(me.text).toMatch(/LEFT JOIN customers/);
    expect(me.text).toMatch(/LEFT JOIN cleaners/);
    expect(me.values).toContain("clerk_caller");
  });

  it("still succeeds (nulls, token email) when no users row exists yet", async () => {
    currentHandler = () => [];
    const res = await buildApp().request("/auth/me", {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(body.user).toEqual({
      clerkId: "clerk_caller",
      email: "caleb@example.com",
      userId: null,
      firstName: null,
      lastName: null,
      role: null,
    });
  });

  it("tolerates NULL name columns (customer rows are created name-less)", async () => {
    currentHandler = () => [
      { id: "user_1", email: "caleb@example.com", role: "customer", first_name: null, last_name: null },
    ];
    const res = await buildApp().request("/auth/me", {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { firstName: unknown; lastName: unknown } };
    expect(body.user.firstName).toBeNull();
    expect(body.user.lastName).toBeNull();
  });

  it("unauthenticated requests stay 401, never 500", async () => {
    authed = false;
    const res = await buildApp().request("/auth/me", {}, ENV);
    expect(res.status).toBe(401);
    expect(calls.length).toBe(0); // no DB touch without auth
  });
});
