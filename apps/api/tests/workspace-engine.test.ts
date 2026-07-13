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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ROLE_PERMISSIONS,
  PERMISSION_KEYS,
  permissionsForRole,
  assertPermission,
  hasAnyPermission,
  PermissionDeniedError,
  type WorkspaceCategory,
} from "../src/lib/rbac";
import {
  generateInvitationToken,
  sha256Hex,
  invitationAcceptEligibility,
} from "../src/lib/invitations";
import {
  validateTransitionPayload,
  invalidPartitionAddressIds,
  convertCustomerToBusinessPayloadSchema,
} from "../src/lib/transitions";
import type { WorkspaceMembership } from "../src/lib/identity";

const MIGRATION = readFileSync(
  resolve(__dirname, "../../../packages/db/src/migrations/090_platform_identity_workspaces.sql"),
  "utf8",
);

/** Parse the seeded (category, key, permissions[]) triples from the SQL. */
function seededRoles(): Array<{ category: string; key: string; permissions: string[] }> {
  const roles: Array<{ category: string; key: string; permissions: string[] }> = [];
  const re = /\('(personal_customer|business_customer|cleaner_business)','([a-z_]+)','[^']*',\s*\n?\s*'\{([^}]*)\}'\)/g;
  for (const m of MIGRATION.matchAll(re)) {
    roles.push({ category: m[1], key: m[2], permissions: m[3].split(",").map((s) => s.trim()) });
  }
  return roles;
}

describe("rbac catalog / migration-090 seed parity", () => {
  it("parses all 15 seeded system roles from the migration", () => {
    expect(seededRoles()).toHaveLength(15);
  });

  it("ROLE_PERMISSIONS mirrors every seeded role array exactly", () => {
    for (const seeded of seededRoles()) {
      const inCode = permissionsForRole(seeded.category as WorkspaceCategory, seeded.key);
      expect(inCode, `${seeded.category}/${seeded.key} missing from ROLE_PERMISSIONS`).toBeDefined();
      expect([...(inCode ?? [])]).toEqual(seeded.permissions);
    }
  });

  it("has no extra roles the seed does not know about", () => {
    const seeded = new Set(seededRoles().map((r) => `${r.category}/${r.key}`));
    for (const [category, roles] of Object.entries(ROLE_PERMISSIONS)) {
      for (const key of Object.keys(roles)) {
        expect(seeded.has(`${category}/${key}`)).toBe(true);
      }
    }
  });

  it("every seeded permission key is in the PERMISSION_KEYS catalog", () => {
    const catalog = new Set<string>(PERMISSION_KEYS);
    for (const seeded of seededRoles()) {
      for (const p of seeded.permissions) {
        expect(catalog.has(p), `catalog missing ${p}`).toBe(true);
      }
    }
  });
});

function membership(permissions: string[]): WorkspaceMembership {
  return {
    membershipId: "m1",
    workspaceId: "w1",
    workspaceCategory: "business_customer",
    workspaceName: "Acme",
    workspaceStatus: "active",
    roleKey: "admin",
    permissions,
    membershipStatus: "active",
  };
}

describe("assertPermission / hasAnyPermission", () => {
  it("passes when the membership carries the key", () => {
    expect(() => assertPermission(membership(["members.manage"]), "members.manage")).not.toThrow();
  });

  it("throws PermissionDeniedError otherwise (and for missing membership)", () => {
    expect(() => assertPermission(membership(["bookings.view"]), "members.manage")).toThrow(
      PermissionDeniedError,
    );
    expect(() => assertPermission(undefined, "members.manage")).toThrow(PermissionDeniedError);
  });

  it("honors the * wildcard", () => {
    expect(() => assertPermission(membership(["*"]), "anything.at_all")).not.toThrow();
    expect(hasAnyPermission(membership(["*"]), ["x.y"])).toBe(true);
  });

  it("hasAnyPermission matches any of the given keys", () => {
    expect(hasAnyPermission(membership(["properties.view"]), ["properties.manage", "properties.view"])).toBe(true);
    expect(hasAnyPermission(membership(["bookings.view"]), ["properties.manage"])).toBe(false);
  });
});

describe("invitation tokens", () => {
  it("generates 64-hex-char (32-byte) unique tokens", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toEqual(b);
  });

  it("sha256Hex is deterministic and never equals the raw token", async () => {
    const raw = generateInvitationToken();
    const h1 = await sha256Hex(raw);
    const h2 = await sha256Hex(raw);
    expect(h1).toEqual(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toEqual(raw);
  });
});

describe("invitation acceptance eligibility (single-use semantics)", () => {
  const future = new Date(Date.now() + 60_000);

  it("accepts a pending, unexpired, application-matched invitation", () => {
    expect(
      invitationAcceptEligibility(
        { status: "pending", expiresAt: future, targetApplication: "business" },
        "business",
      ),
    ).toEqual({ ok: true });
  });

  it("rejects once no longer pending — the claim consumed it", () => {
    for (const status of ["accepted", "revoked", "expired"]) {
      expect(
        invitationAcceptEligibility(
          { status, expiresAt: future, targetApplication: "business" },
          "business",
        ),
      ).toEqual({ ok: false, reason: "not_pending" });
    }
  });

  it("rejects expired invitations", () => {
    expect(
      invitationAcceptEligibility(
        { status: "pending", expiresAt: new Date(Date.now() - 1), targetApplication: "business" },
        "business",
      ),
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects an identity from the wrong application silo", () => {
    expect(
      invitationAcceptEligibility(
        { status: "pending", expiresAt: future, targetApplication: "business" },
        "customer",
      ),
    ).toEqual({ ok: false, reason: "wrong_application" });
  });
});

describe("transition payload validation", () => {
  it("accepts a create_business_workspace payload", () => {
    expect(
      validateTransitionPayload("create_business_workspace", { workspaceName: "Acme Props" }),
    ).toEqual({ workspaceName: "Acme Props" });
  });

  it("rejects unknown fields (strict)", () => {
    expect(() =>
      validateTransitionPayload("create_business_workspace", {
        workspaceName: "Acme",
        totalCents: 1,
      }),
    ).toThrow();
  });

  it("full mode must not carry addressIds", () => {
    expect(() =>
      convertCustomerToBusinessPayloadSchema.parse({
        workspaceName: "Acme",
        mode: "full",
        addressIds: ["4c2c7a2e-8a54-4f3b-9a10-0f6a4c1c2d3e"],
      }),
    ).toThrow();
    expect(
      convertCustomerToBusinessPayloadSchema.parse({ workspaceName: "Acme", mode: "full" }).mode,
    ).toBe("full");
  });

  it("partition mode requires at least one uuid addressId", () => {
    expect(() =>
      convertCustomerToBusinessPayloadSchema.parse({ workspaceName: "Acme", mode: "partition" }),
    ).toThrow();
    expect(() =>
      convertCustomerToBusinessPayloadSchema.parse({
        workspaceName: "Acme",
        mode: "partition",
        addressIds: ["not-a-uuid"],
      }),
    ).toThrow();
    const ok = convertCustomerToBusinessPayloadSchema.parse({
      workspaceName: "Acme",
      mode: "partition",
      addressIds: ["4c2c7a2e-8a54-4f3b-9a10-0f6a4c1c2d3e"],
    });
    expect(ok.addressIds).toHaveLength(1);
  });
});

describe("partition ownership validation", () => {
  const owned = ["a-1", "a-2", "a-3"];

  it("passes when every requested id is owned", () => {
    expect(invalidPartitionAddressIds(["a-1", "a-3"], owned)).toEqual([]);
  });

  it("returns exactly the foreign ids", () => {
    expect(invalidPartitionAddressIds(["a-1", "b-9", "c-8"], owned)).toEqual(["b-9", "c-8"]);
  });

  it("rejects everything when the person owns nothing", () => {
    expect(invalidPartitionAddressIds(["a-1"], [])).toEqual(["a-1"]);
  });
});
