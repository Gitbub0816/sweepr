/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect } from "vitest";
import { resolveAuthApp, isAuthApplication } from "../src/lib/authApps";
import { hasPermission, membershipFor, type ResolvedIdentity, type WorkspaceMembership } from "../src/lib/identity";
import type { Env } from "../src/types";

function env(overrides: Partial<Env> = {}): Env {
  return {
    CLERK_SECRET_KEY: "sk_primary",
    CLERK_ADMIN_SECRET_KEY: "sk_admin",
    ...overrides,
  } as Env;
}

describe("resolveAuthApp issuer routing", () => {
  it("routes primary issuer to customer app", () => {
    const r = resolveAuthApp("https://clerk.getsweepr.com", env());
    expect(r).toEqual({ app: "customer", secretKey: "sk_primary" });
  });

  it("routes admin issuer to the admin app's key", () => {
    const r = resolveAuthApp("https://clerk.admin.getsweepr.com", env());
    expect(r).toEqual({ app: "admin", secretKey: "sk_admin" });
  });

  it("admin boundary is dark without its key — never falls back to primary", () => {
    const r = resolveAuthApp(
      "https://clerk.admin.getsweepr.com",
      env({ CLERK_ADMIN_SECRET_KEY: undefined }),
    );
    expect(r).toBeUndefined();
  });

  it("business boundary is dark until CLERK_BUSINESS_SECRET_KEY exists", () => {
    expect(resolveAuthApp("https://clerk.business.getsweepr.com", env())).toBeUndefined();
    const r = resolveAuthApp(
      "https://clerk.business.getsweepr.com",
      env({ CLERK_BUSINESS_SECRET_KEY: "sk_biz" }),
    );
    expect(r).toEqual({ app: "business", secretKey: "sk_biz" });
  });

  it("cleaner issuer uses the shared primary pool until the dedicated key ships", () => {
    // Today clean.getsweepr.com tokens are issued by the primary instance.
    const shared = resolveAuthApp("https://clerk.getsweepr.com", env());
    expect(shared?.app).toBe("customer");
    // Once the dedicated instance exists, its issuer routes to "cleaner".
    const dedicated = resolveAuthApp(
      "https://clerk.clean.getsweepr.com",
      env({ CLERK_CLEANER_SECRET_KEY: "sk_cleaner" }),
    );
    expect(dedicated).toEqual({ app: "cleaner", secretKey: "sk_cleaner" });
  });

  it("dev/unknown issuers fall back to the primary key as customer", () => {
    const r = resolveAuthApp("https://neat-app-42.clerk.accounts.dev", env());
    expect(r).toEqual({ app: "customer", secretKey: "sk_primary" });
  });

  it("a forged admin issuer cannot select the primary key", () => {
    // The forged iss routes to the admin key; the token can never verify
    // against it — routing must not silently downgrade to CLERK_SECRET_KEY.
    const r = resolveAuthApp("https://evil.admin.getsweepr.com.attacker.dev", env());
    expect(r?.secretKey).toBe("sk_admin");
  });

  it("validates auth application names", () => {
    expect(isAuthApplication("business")).toBe(true);
    expect(isAuthApplication("superuser")).toBe(false);
  });
});

describe("identity membership helpers", () => {
  const m = (over: Partial<WorkspaceMembership>): WorkspaceMembership => ({
    membershipId: "m1",
    workspaceId: "w1",
    workspaceCategory: "business_customer",
    workspaceName: "Acme",
    workspaceStatus: "active",
    roleKey: "scheduler",
    permissions: ["bookings.create", "bookings.read"],
    membershipStatus: "active",
    ...over,
  });

  const resolved: ResolvedIdentity = {
    identity: {
      id: "ai1",
      platformPersonId: "pp1",
      authApplication: "business",
      providerUserId: "user_1",
      status: "active",
    },
    person: {
      id: "pp1",
      userId: null,
      firstName: "Ada",
      lastName: "L",
      canonicalEmail: "ada@example.com",
      status: "active",
    },
    memberships: [m({}), m({ membershipId: "m2", workspaceId: "w2", permissions: ["*"] })],
  };

  it("finds the membership for a workspace", () => {
    expect(membershipFor(resolved, "w2")?.membershipId).toBe("m2");
    expect(membershipFor(resolved, "nope")).toBeUndefined();
  });

  it("checks explicit permissions and the wildcard", () => {
    expect(hasPermission(membershipFor(resolved, "w1"), "bookings.create")).toBe(true);
    expect(hasPermission(membershipFor(resolved, "w1"), "members.invite")).toBe(false);
    expect(hasPermission(membershipFor(resolved, "w2"), "anything.at.all")).toBe(true);
    expect(hasPermission(undefined, "bookings.read")).toBe(false);
  });
});
