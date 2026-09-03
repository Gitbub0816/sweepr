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
 * Server-side cleaner eligibility checks — the source of truth the UI
 * checklists mirror. Enforced at job-accept time so no client can bypass it.
 */
import type { Sql } from "./db";

export interface InsuranceCheck {
  valid: boolean;
  reason: "none" | "pending_review" | "expired" | "rejected" | "ok";
}

/**
 * A cleaner has valid insurance when their OWN policy has been approved by an
 * admin ('active') and has not passed its expiry date.
 *
 * Sweepr does not provide insurance. The withdrawn "Sweepr Coverage Program"
 * (coverage_type 'sweepr_program') never put a real policy in force, so a
 * legacy row carrying it is explicitly NOT valid coverage — that cleaner is
 * uninsured and must buy a policy (the cleaner app links our Coverdash
 * affiliate) and upload the certificate before accepting jobs.
 */
export async function checkInsurance(sql: Sql, cleanerId: string): Promise<InsuranceCheck> {
  const rows = (await sql`
    SELECT coverage_type, policy_status, policy_expires_at
    FROM cleaner_insurance WHERE cleaner_id = ${cleanerId} LIMIT 1
  `) as Array<{
    coverage_type: string;
    policy_status: string;
    policy_expires_at: string | null;
  }>;
  const ins = rows[0];
  if (!ins) return { valid: false, reason: "none" };

  // A legacy enrollment in the withdrawn program is not coverage. Treated as
  // "none" so the cleaner is prompted to get a real policy, rather than
  // slipping through on a policy_status='active' row with no insurer behind it.
  if (ins.coverage_type === "sweepr_program") return { valid: false, reason: "none" };

  // The cleaner's own policy
  if (ins.policy_status === "rejected") return { valid: false, reason: "rejected" };
  if (ins.policy_status !== "active" && ins.policy_status !== "expiring_soon") {
    return { valid: false, reason: "pending_review" };
  }
  if (ins.policy_expires_at && new Date(ins.policy_expires_at) < new Date()) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, reason: "ok" };
}
