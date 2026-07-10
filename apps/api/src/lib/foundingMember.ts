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
 * Founding Member Program.
 *
 * A one-time, permanent designation for the earliest cleaners AND customers.
 * Status is granted while an enrollment window is open (bounded by an optional
 * date cutoff and/or an optional member-count cutoff), assigns a sequential
 * founder number, and confers lifetime perks (chiefly a 5% cleaner earnings
 * bonus). Status survives temporary suspension — only an explicit revoke (Trust
 * & Safety) removes it, and it can be restored.
 *
 * All grants are claim-then-act: a conditional UPDATE flips the flag and pulls
 * a founder number from a Postgres sequence in one statement, so two concurrent
 * enrollment attempts can never mint two rows or skip/duplicate a number.
 */

import type { Sql } from "./db";

export type FoundingAudience = "cleaner" | "customer";

export interface FoundingConfig {
  cleanerEnrollmentOpen: boolean;
  customerEnrollmentOpen: boolean;
  cleanerCutoffAt: Date | null;
  customerCutoffAt: Date | null;
  cleanerMaxMembers: number | null;
  customerMaxMembers: number | null;
  earningsBonusPct: number; // cleaner lifetime payout bonus
  sinceLabel: string; // "Founding Member since 2026"
}

const DEFAULTS: FoundingConfig = {
  cleanerEnrollmentOpen: true,
  customerEnrollmentOpen: true,
  cleanerCutoffAt: null,
  customerCutoffAt: null,
  cleanerMaxMembers: null,
  customerMaxMembers: null,
  earningsBonusPct: 5,
  sinceLabel: "2026",
};

function parseDate(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseIntOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function loadFoundingConfig(sql: Sql): Promise<FoundingConfig> {
  try {
    const rows = (await sql`
      SELECT key, value FROM site_settings WHERE key LIKE 'founding.%'
    `) as Array<{ key: string; value: string }>;
    const m: Record<string, string> = {};
    for (const r of rows) m[r.key] = r.value;
    return {
      cleanerEnrollmentOpen: (m["founding.cleaner_enrollment_open"] ?? "true") !== "false",
      customerEnrollmentOpen: (m["founding.customer_enrollment_open"] ?? "true") !== "false",
      cleanerCutoffAt: parseDate(m["founding.cleaner_cutoff_at"]),
      customerCutoffAt: parseDate(m["founding.customer_cutoff_at"]),
      cleanerMaxMembers: parseIntOrNull(m["founding.cleaner_max_members"]),
      customerMaxMembers: parseIntOrNull(m["founding.customer_max_members"]),
      earningsBonusPct: m["founding.earnings_bonus_pct"]
        ? Number(m["founding.earnings_bonus_pct"]) || 5
        : 5,
      sinceLabel: m["founding.since_label"] || "2026",
    };
  } catch {
    return DEFAULTS;
  }
}

/** Whether the enrollment window is still open for an audience (date + count). */
export async function isEnrollmentOpen(
  sql: Sql,
  audience: FoundingAudience,
  cfg?: FoundingConfig,
): Promise<boolean> {
  const c = cfg ?? (await loadFoundingConfig(sql));
  const open = audience === "cleaner" ? c.cleanerEnrollmentOpen : c.customerEnrollmentOpen;
  if (!open) return false;

  const cutoff = audience === "cleaner" ? c.cleanerCutoffAt : c.customerCutoffAt;
  if (cutoff && Date.now() > cutoff.getTime()) return false;

  const max = audience === "cleaner" ? c.cleanerMaxMembers : c.customerMaxMembers;
  if (max !== null) {
    const rows = (
      audience === "cleaner"
        ? await sql`SELECT COUNT(*)::int AS n FROM cleaners WHERE founding_member = TRUE`
        : await sql`SELECT COUNT(*)::int AS n FROM customers WHERE founding_member = TRUE`
    ) as Array<{ n: number }>;
    if ((rows[0]?.n ?? 0) >= max) return false;
  }
  return true;
}

export interface EnrollResult {
  status: "granted" | "already_member" | "window_closed" | "not_found";
  founderId?: number;
  since?: string;
}

/**
 * Grant Founding Member status to a cleaner or customer if the window is open.
 * Idempotent: an existing (non-revoked) member is reported as already_member
 * and keeps its original number/date. Concurrency-safe via a single conditional
 * UPDATE that pulls the next sequence value only when the flag actually flips.
 */
export async function enroll(
  sql: Sql,
  audience: FoundingAudience,
  id: string,
  opts: { force?: boolean } = {},
): Promise<EnrollResult> {
  const isCleaner = audience === "cleaner";

  // Already an (active) member?
  const existing = (
    isCleaner
      ? await sql`SELECT founding_member, founding_member_id, founding_member_since, founding_member_revoked
                  FROM cleaners WHERE id = ${id} LIMIT 1`
      : await sql`SELECT founding_member, founding_member_id, founding_member_since, founding_member_revoked
                  FROM customers WHERE id = ${id} LIMIT 1`
  ) as Array<{
    founding_member: boolean;
    founding_member_id: number | null;
    founding_member_since: string | null;
    founding_member_revoked: boolean;
  }>;
  if (!existing[0]) return { status: "not_found" };
  if (existing[0].founding_member) {
    return {
      status: "already_member",
      founderId: existing[0].founding_member_id ?? undefined,
      since: existing[0].founding_member_since ?? undefined,
    };
  }

  if (!opts.force) {
    if (!(await isEnrollmentOpen(sql, audience))) return { status: "window_closed" };
  }

  // Claim-then-act: flip the flag and assign a number in one statement. WHERE
  // guards against a concurrent winner (founding_member already TRUE).
  const rows = (
    isCleaner
      ? await sql`
          UPDATE cleaners SET
            founding_member = TRUE,
            founding_member_id = nextval('founding_member_cleaner_seq'),
            founding_member_since = NOW(),
            founding_member_revoked = FALSE,
            founding_member_revoked_reason = NULL,
            founding_member_revoked_at = NULL
          WHERE id = ${id} AND founding_member = FALSE
          RETURNING founding_member_id, founding_member_since`
      : await sql`
          UPDATE customers SET
            founding_member = TRUE,
            founding_member_id = nextval('founding_member_customer_seq'),
            founding_member_since = NOW(),
            founding_member_revoked = FALSE,
            founding_member_revoked_reason = NULL,
            founding_member_revoked_at = NULL
          WHERE id = ${id} AND founding_member = FALSE
          RETURNING founding_member_id, founding_member_since`
  ) as Array<{ founding_member_id: number; founding_member_since: string }>;

  if (!rows[0]) {
    // Lost the race — re-read the winner's assignment.
    const w = (
      isCleaner
        ? await sql`SELECT founding_member_id, founding_member_since FROM cleaners WHERE id = ${id}`
        : await sql`SELECT founding_member_id, founding_member_since FROM customers WHERE id = ${id}`
    ) as Array<{ founding_member_id: number | null; founding_member_since: string | null }>;
    return {
      status: "already_member",
      founderId: w[0]?.founding_member_id ?? undefined,
      since: w[0]?.founding_member_since ?? undefined,
    };
  }
  return {
    status: "granted",
    founderId: rows[0].founding_member_id,
    since: rows[0].founding_member_since,
  };
}

/** Revoke status (keeps the number for auditing; benefits stop). */
export async function revoke(
  sql: Sql,
  audience: FoundingAudience,
  id: string,
  reason: string,
): Promise<boolean> {
  const rows = (
    audience === "cleaner"
      ? await sql`
          UPDATE cleaners SET
            founding_member = FALSE, founding_member_revoked = TRUE,
            founding_member_revoked_reason = ${reason}, founding_member_revoked_at = NOW()
          WHERE id = ${id} AND founding_member = TRUE RETURNING id`
      : await sql`
          UPDATE customers SET
            founding_member = FALSE, founding_member_revoked = TRUE,
            founding_member_revoked_reason = ${reason}, founding_member_revoked_at = NOW()
          WHERE id = ${id} AND founding_member = TRUE RETURNING id`
  ) as Array<{ id: string }>;
  return rows.length > 0;
}

/** Restore a previously-revoked member (reuses the original founder number). */
export async function restore(
  sql: Sql,
  audience: FoundingAudience,
  id: string,
): Promise<boolean> {
  const rows = (
    audience === "cleaner"
      ? await sql`
          UPDATE cleaners SET
            founding_member = TRUE, founding_member_revoked = FALSE,
            founding_member_revoked_reason = NULL, founding_member_revoked_at = NULL,
            founding_member_since = COALESCE(founding_member_since, NOW()),
            founding_member_id = COALESCE(founding_member_id, nextval('founding_member_cleaner_seq'))
          WHERE id = ${id} AND founding_member_revoked = TRUE RETURNING id`
      : await sql`
          UPDATE customers SET
            founding_member = TRUE, founding_member_revoked = FALSE,
            founding_member_revoked_reason = NULL, founding_member_revoked_at = NULL,
            founding_member_since = COALESCE(founding_member_since, NOW()),
            founding_member_id = COALESCE(founding_member_id, nextval('founding_member_customer_seq'))
          WHERE id = ${id} AND founding_member_revoked = TRUE RETURNING id`
  ) as Array<{ id: string }>;
  return rows.length > 0;
}

export interface FoundingStatus {
  isFoundingMember: boolean;
  founderId: number | null;
  since: string | null;
  sinceLabel: string;
  welcomeSeen: boolean;
  revoked: boolean;
  /** Chosen badge colorway (null until the one-time pick is made). */
  badgeColor: string | null;
  /** Full URL of the founder's badge SVG (color + first-name initial), once chosen. */
  badgeUrl: string | null;
}

// ─── Founder badge artwork ───────────────────────────────────────────────────
// Five colorways live in R2; each folder holds one SVG per first-name initial
// (a–z). The founder picks a color EXACTLY ONCE — it can never be changed —
// and the initial is always inferred from their first name, never chosen.
export const FOUNDER_BADGE_COLORS = [
  "carbon-gold",
  "rose-gold",
  "classic-gold",
  "seafoam-gold",
  "minimal-gold",
] as const;
export type FounderBadgeColor = (typeof FOUNDER_BADGE_COLORS)[number];

const BADGE_BASE = "https://objects.getsweepr.com/site_assets/Founder_Badges";

/** First-name initial for the badge artwork (a–z; non-letters fall back to 'a'). */
export function badgeInitial(firstName: string | null | undefined): string {
  const ch = (firstName ?? "").trim().charAt(0).toLowerCase();
  return /[a-z]/.test(ch) ? ch : "a";
}

export function founderBadgeUrl(color: string, firstName: string | null | undefined): string {
  const initial = badgeInitial(firstName);
  return `${BADGE_BASE}/${color}/sweepr-founding-member-${color}-${initial}.svg`;
}

export type ChooseBadgeResult = "chosen" | "already_locked" | "invalid_color" | "not_a_member";

/**
 * Lock in the founder's badge color. One-time and irreversible by design: the
 * conditional UPDATE only fires while founding_badge_locked_at IS NULL, so a
 * second attempt (or a concurrent double-submit) can never overwrite the pick.
 */
export async function chooseBadgeColor(
  sql: Sql,
  audience: FoundingAudience,
  id: string,
  color: string,
): Promise<ChooseBadgeResult> {
  if (!(FOUNDER_BADGE_COLORS as readonly string[]).includes(color)) return "invalid_color";
  const rows = (
    audience === "cleaner"
      ? await sql`
          UPDATE cleaners
          SET founding_badge_color = ${color}, founding_badge_locked_at = NOW()
          WHERE id = ${id} AND founding_member = TRUE AND founding_badge_locked_at IS NULL
          RETURNING id`
      : await sql`
          UPDATE customers
          SET founding_badge_color = ${color}, founding_badge_locked_at = NOW()
          WHERE id = ${id} AND founding_member = TRUE AND founding_badge_locked_at IS NULL
          RETURNING id`
  ) as Array<{ id: string }>;
  if (rows[0]) return "chosen";

  // Distinguish "already locked" from "not a member" for a useful error.
  const check = (
    audience === "cleaner"
      ? await sql`SELECT founding_member, founding_badge_locked_at FROM cleaners WHERE id = ${id} LIMIT 1`
      : await sql`SELECT founding_member, founding_badge_locked_at FROM customers WHERE id = ${id} LIMIT 1`
  ) as Array<{ founding_member: boolean; founding_badge_locked_at: string | null }>;
  if (!check[0]?.founding_member) return "not_a_member";
  return "already_locked";
}

/** Read a cleaner/customer's founding status for API responses + UI badges. */
export async function getFoundingStatus(
  sql: Sql,
  audience: FoundingAudience,
  id: string,
  cfg?: FoundingConfig,
): Promise<FoundingStatus | null> {
  const rows = (
    audience === "cleaner"
      ? await sql`SELECT founding_member, founding_member_id, founding_member_since,
                         founding_member_revoked, founding_welcome_seen,
                         founding_badge_color, first_name
                  FROM cleaners WHERE id = ${id} LIMIT 1`
      : await sql`SELECT founding_member, founding_member_id, founding_member_since,
                         founding_member_revoked, founding_welcome_seen,
                         founding_badge_color, first_name
                  FROM customers WHERE id = ${id} LIMIT 1`
  ) as Array<{
    founding_member: boolean;
    founding_member_id: number | null;
    founding_member_since: string | null;
    founding_member_revoked: boolean;
    founding_welcome_seen: boolean;
    founding_badge_color: string | null;
    first_name: string | null;
  }>;
  if (!rows[0]) return null;
  const r = rows[0];
  const c = cfg ?? (await loadFoundingConfig(sql));
  return {
    isFoundingMember: r.founding_member,
    founderId: r.founding_member_id,
    since: r.founding_member_since,
    sinceLabel: c.sinceLabel,
    welcomeSeen: r.founding_welcome_seen,
    revoked: r.founding_member_revoked,
    badgeColor: r.founding_badge_color,
    badgeUrl: r.founding_badge_color
      ? founderBadgeUrl(r.founding_badge_color, r.first_name)
      : null,
  };
}

/** Mark the one-time congratulations screen as shown. */
export async function markWelcomeSeen(
  sql: Sql,
  audience: FoundingAudience,
  id: string,
): Promise<void> {
  if (audience === "cleaner") {
    await sql`UPDATE cleaners SET founding_welcome_seen = TRUE WHERE id = ${id}`;
  } else {
    await sql`UPDATE customers SET founding_welcome_seen = TRUE WHERE id = ${id}`;
  }
}

/**
 * Payout multiplier contribution for a cleaner: 1 + bonus% while the cleaner is
 * an ACTIVE (non-revoked) Founding Member, else 1. Multiplied into the tier
 * multiplier at payout time so it compounds correctly with tier bonuses.
 */
export async function foundingPayoutMultiplier(
  sql: Sql,
  cleanerId: string,
  cfg?: FoundingConfig,
): Promise<number> {
  try {
    const rows = (await sql`
      SELECT founding_member, founding_member_revoked
        FROM cleaners WHERE id = ${cleanerId} LIMIT 1
    `) as Array<{ founding_member: boolean; founding_member_revoked: boolean }>;
    const active = rows[0]?.founding_member && !rows[0].founding_member_revoked;
    if (!active) return 1;
    const c = cfg ?? (await loadFoundingConfig(sql));
    return 1 + c.earningsBonusPct / 100;
  } catch {
    return 1;
  }
}
