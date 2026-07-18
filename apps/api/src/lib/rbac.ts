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
 * Workspace RBAC catalog (multi-app auth architecture).
 *
 * The DB seeds system roles per workspace category with a TEXT[] of permission
 * keys (migration 090). This module is the code-side mirror of that seed —
 * new keys are added HERE (and to new custom roles) without migrations, but
 * the seeded system-role arrays below must stay byte-identical to the SQL so
 * code and DB never disagree about what a role can do
 * (apps/api/tests/workspace-engine.test.ts asserts parity against the SQL).
 *
 * Permission checks always run against the membership's DB-loaded permissions
 * (identity.ts `hasPermission`); this catalog exists for validation, admin
 * UIs, and role provisioning.
 */

import type { WorkspaceMembership } from "./identity";

export type WorkspaceCategory =
  | "personal_customer"
  | "business_customer"
  | "cleaner_business";

/** Every permission key the platform understands, namespaced `domain.verb`. */
export const PERMISSION_KEYS = [
  // workspace administration
  "workspace.manage",
  "workspace.close",
  "workspace.transfer",
  // membership administration
  "members.manage",
  "members.invite",
  "members.manage_roles",
  // properties (addresses owned by the workspace)
  "properties.manage",
  "properties.view",
  "properties.assigned",
  "properties.instructions",
  "properties.read",
  // bookings
  "bookings.manage",
  "bookings.create",
  "bookings.reschedule",
  "bookings.cancel",
  "bookings.view",
  "bookings.read",
  "bookings.communicate",
  // billing / finance (business customer)
  "billing.manage",
  "billing.view",
  "billing.read",
  "invoices.export",
  // reporting
  "reports.view",
  "reports.read",
  // integrations & cross-app transitions
  "integrations.manage",
  "transitions.initiate",
  // cleaner business — jobs & dispatch
  "jobs.manage",
  "jobs.dispatch",
  "jobs.view",
  "jobs.accept",
  "jobs.assigned",
  "jobs.review",
  "jobs.checkin",
  "jobs.photos",
  "jobs.complete",
  // cleaner business — team & scheduling
  "team.manage",
  "team.assigned",
  "team.communicate",
  "schedules.manage",
  "schedules.view",
  "schedule.own",
  "assignments.manage",
  "areas.manage",
  // cleaner business — compliance & finance
  "compliance.manage",
  "compliance.view",
  "eligibility.suspend",
  "finance.read",
  "earnings.view",
  "payouts.manage",
  "payouts.export",
  "fees.view",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/**
 * System-role permission map — EXACT mirror of the seed arrays in
 * packages/db/src/migrations/090_platform_identity_workspaces.sql.
 * Do not edit one without the other.
 */
export const ROLE_PERMISSIONS: Record<
  WorkspaceCategory,
  Record<string, readonly string[]>
> = {
  business_customer: {
    owner: [
      "workspace.manage",
      "workspace.close",
      "workspace.transfer",
      "members.manage",
      "properties.manage",
      "bookings.manage",
      "billing.manage",
      "reports.view",
      "integrations.manage",
    ],
    admin: [
      "workspace.manage",
      "members.manage",
      "properties.manage",
      "bookings.manage",
      "reports.view",
    ],
    property_manager: [
      "properties.assigned",
      "bookings.manage",
      "bookings.communicate",
      "properties.instructions",
    ],
    scheduler: [
      "properties.view",
      "bookings.create",
      "bookings.reschedule",
      "bookings.cancel",
    ],
    billing_manager: ["billing.manage", "billing.view", "invoices.export"],
    accountant: ["billing.view", "invoices.export"],
    viewer: ["properties.view", "bookings.view"],
  },
  cleaner_business: {
    owner: [
      "workspace.manage",
      "workspace.close",
      "workspace.transfer",
      "members.manage",
      "payouts.manage",
      "compliance.manage",
      "areas.manage",
      "jobs.manage",
      "reports.view",
    ],
    operations_admin: [
      "jobs.manage",
      "schedules.manage",
      "assignments.manage",
      "areas.manage",
      "reports.view",
    ],
    dispatcher: [
      "jobs.view",
      "jobs.accept",
      "assignments.manage",
      "schedules.view",
      "team.communicate",
    ],
    team_lead: ["team.assigned", "jobs.assigned", "jobs.review"],
    cleaner: [
      "jobs.assigned",
      "jobs.checkin",
      "jobs.photos",
      "jobs.complete",
      "schedule.own",
    ],
    compliance_manager: [
      "compliance.view",
      "compliance.manage",
      "eligibility.suspend",
    ],
    finance: ["earnings.view", "payouts.export", "fees.view"],
  },
  personal_customer: {
    owner: [
      "workspace.manage",
      "properties.manage",
      "bookings.manage",
      "billing.manage",
    ],
  },
};

/** Permission arrays for one seeded system role, or undefined if unknown. */
export function permissionsForRole(
  category: WorkspaceCategory,
  key: string,
): readonly string[] | undefined {
  return ROLE_PERMISSIONS[category]?.[key];
}

/** Error carrying a 403-shaped signal for route handlers to translate. */
export class PermissionDeniedError extends Error {
  readonly permission: string;
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionDeniedError";
    this.permission = permission;
  }
}

/**
 * Assert a membership carries a permission (or the `*` wildcard).
 * Throws PermissionDeniedError so routes can map it to 403 uniformly.
 */
export function assertPermission(
  membership: WorkspaceMembership | undefined,
  permission: string,
): asserts membership is WorkspaceMembership {
  const perms = membership?.permissions ?? [];
  if (!perms.includes(permission) && !perms.includes("*")) {
    throw new PermissionDeniedError(permission);
  }
}

/** True when the membership holds ANY of the given permissions. */
export function hasAnyPermission(
  membership: WorkspaceMembership | undefined,
  permissions: readonly string[],
): boolean {
  const perms = membership?.permissions ?? [];
  if (perms.includes("*")) return true;
  return permissions.some((p) => perms.includes(p));
}
