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
 * Fine-grained admin permissions.
 *
 * Model:
 *  - Every admin screen has a permission key ("screen.<slug>"), and sensitive
 *    content/actions within screens have their own keys ("content.<area>.<act>").
 *  - Department roles (admin_role) are ORGANIZATIONAL PRESETS: each maps to a
 *    default set of keys (ROLE_DEFAULTS).
 *  - Per-user overrides (admin_permission_overrides) then add or remove
 *    individual keys with surgical precision — the role is just the starting
 *    point, and any single key can be toggled for any single user.
 *  - super_admin (and the founding owner) implicitly hold every permission.
 *
 * The catalog is the single source of truth; the admin UI fetches it so screens
 * and toggles stay in sync with the backend.
 */

export interface PermissionDef {
  key: string;
  label: string;
  /** Optional route this screen key gates (for the UI nav/guard mapping). */
  route?: string;
}

export interface PermissionGroup {
  group: string;
  label: string;
  permissions: PermissionDef[];
}

/** Screen permissions — one per admin nav destination. */
const SCREENS: Array<{ slug: string; label: string; route: string }> = [
  { slug: "dashboard", label: "Dashboard", route: "/" },
  { slug: "jobs", label: "Jobs", route: "/jobs" },
  { slug: "customers", label: "Customers", route: "/customers" },
  { slug: "cleaners", label: "Cleaners", route: "/cleaners" },
  { slug: "applications", label: "Applications", route: "/applications" },
  { slug: "pricing", label: "Pricing", route: "/pricing" },
  { slug: "cleaning_pricing", label: "Cleaning Pricing", route: "/cleaning-pricing" },
  { slug: "promotions", label: "Promotions", route: "/promotions" },
  { slug: "approvals", label: "Approvals", route: "/approvals" },
  { slug: "scope_review", label: "Scope Review", route: "/scope-review" },
  { slug: "trust_safety", label: "Trust & Safety", route: "/trust-safety" },
  { slug: "legal_archive", label: "Legal Archive", route: "/legal-archive" },
  { slug: "insurance", label: "Insurance", route: "/insurance" },
  { slug: "founding_members", label: "Founding Members", route: "/founding-members" },
  { slug: "smart_entry", label: "Smart Entry", route: "/smart-entry" },
  { slug: "disputes", label: "Disputes", route: "/disputes" },
  { slug: "payouts", label: "Payouts", route: "/payouts" },
  { slug: "service_areas", label: "Service Areas", route: "/service-areas" },
  { slug: "events", label: "Events", route: "/events" },
  { slug: "status", label: "Status", route: "/status" },
  { slug: "training", label: "Training", route: "/training" },
  { slug: "courses", label: "Course Builder", route: "/courses" },
  { slug: "email", label: "Email", route: "/email" },
  { slug: "broadcasts", label: "Broadcasts", route: "/broadcasts" },
  { slug: "newsletter", label: "Newsletter", route: "/newsletter" },
  { slug: "mail", label: "Mail", route: "/mail" },
  { slug: "observability", label: "Observability", route: "/observability" },
  { slug: "errors", label: "Errors", route: "/errors" },
  { slug: "it_portal", label: "IT Portal", route: "/it-portal" },
  { slug: "security", label: "Security", route: "/security" },
  { slug: "notifications", label: "Notifications", route: "/notifications" },
  { slug: "slack", label: "Slack", route: "/slack" },
  { slug: "automation", label: "Automation", route: "/automation" },
  { slug: "admins", label: "Admin Team", route: "/admins" },
  { slug: "access_control", label: "Access Control", route: "/access-control" },
  { slug: "settings", label: "Settings", route: "/settings" },
];

export function screenKey(slug: string): string {
  return `screen.${slug}`;
}

/** Sensitive content/actions gated INSIDE a screen (down to the content level). */
const CONTENT: PermissionDef[] = [
  { key: "content.customers.view_pii", label: "View customer PII (email, phone, address)" },
  { key: "content.customers.edit_status", label: "Change customer account status / greylist" },
  { key: "content.cleaners.suspend", label: "Suspend / reactivate cleaners" },
  { key: "content.cleaners.view_pii", label: "View cleaner PII & background-check status" },
  { key: "content.pricing.edit", label: "Create / edit / activate pricing rules" },
  { key: "content.payouts.release", label: "Release / adjust cleaner payouts" },
  { key: "content.approvals.decide", label: "Approve / reject fee & pricing proposals" },
  { key: "content.scope_review.decide", label: "Approve / deny scope-review requests" },
  { key: "content.disputes.resolve", label: "Resolve disputes (refunds/credits)" },
  { key: "content.assignment.config", label: "Edit assignment-engine configuration" },
  { key: "content.mail.send", label: "Send email from shared mailboxes" },
  { key: "content.admins.manage", label: "Invite / remove admins & set roles" },
  { key: "content.access_control.edit", label: "Edit other users' permissions" },
];

export const PERMISSION_CATALOG: PermissionGroup[] = [
  {
    group: "screens",
    label: "Screens",
    permissions: SCREENS.map((s) => ({ key: screenKey(s.slug), label: s.label, route: s.route })),
  },
  {
    group: "content",
    label: "Sensitive content & actions",
    permissions: CONTENT,
  },
];

/** Flat list of every valid permission key. */
export const ALL_PERMISSION_KEYS: string[] = PERMISSION_CATALOG.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

export function isValidPermissionKey(key: string): boolean {
  return ALL_PERMISSION_KEYS.includes(key);
}

const ALL = new Set(ALL_PERMISSION_KEYS);

/** Screen keys granted to a base role by default. */
const ROLE_SCREEN_DEFAULTS: Record<string, string[]> = {
  admin: SCREENS.map((s) => s.slug).filter((s) => s !== "access_control"),
  ops: ["dashboard", "jobs", "customers", "cleaners", "applications", "disputes", "service_areas", "scope_review", "trust_safety", "automation", "events"],
  finance: ["dashboard", "payouts", "pricing", "cleaning_pricing", "approvals", "insurance"],
  support: ["dashboard", "customers", "jobs", "mail", "notifications", "disputes"],
  trainer: ["dashboard", "training", "courses"],
  it: ["dashboard", "it_portal", "errors", "observability", "notifications", "slack", "status"],
  security: ["dashboard", "security", "errors", "observability", "trust_safety"],
};

const ROLE_CONTENT_DEFAULTS: Record<string, string[]> = {
  admin: CONTENT.map((c) => c.key).filter((k) => k !== "content.access_control.edit" && k !== "content.admins.manage"),
  ops: ["content.customers.view_pii", "content.customers.edit_status", "content.cleaners.suspend", "content.cleaners.view_pii", "content.scope_review.decide", "content.assignment.config"],
  finance: ["content.pricing.edit", "content.payouts.release", "content.approvals.decide"],
  support: ["content.customers.view_pii", "content.disputes.resolve", "content.mail.send"],
  trainer: [],
  it: [],
  security: ["content.cleaners.view_pii"],
};

/**
 * The default permission set for a role (before per-user overrides).
 * super_admin / owner are handled by the caller (they get everything).
 */
export function roleDefaultPermissions(adminRole: string | null): Set<string> {
  const base = adminRole ? (adminRole.endsWith("_senior") ? adminRole.slice(0, -7) : adminRole) : "admin";
  const screens = (ROLE_SCREEN_DEFAULTS[base] ?? ROLE_SCREEN_DEFAULTS.admin).map(screenKey);
  const content = ROLE_CONTENT_DEFAULTS[base] ?? [];
  return new Set([...screens, ...content]);
}

export interface PermissionOverride {
  permission_key: string;
  allow: boolean;
}

/**
 * Resolve a user's EFFECTIVE permissions: role defaults, then apply per-user
 * overrides (allow adds, deny removes). super_admin / owner get everything.
 */
export function effectivePermissions(
  opts: { isSuper: boolean; adminRole: string | null; overrides: PermissionOverride[] },
): Set<string> {
  if (opts.isSuper) return new Set(ALL);
  const set = roleDefaultPermissions(opts.adminRole);
  for (const o of opts.overrides) {
    if (!ALL.has(o.permission_key)) continue;
    if (o.allow) set.add(o.permission_key);
    else set.delete(o.permission_key);
  }
  return set;
}
