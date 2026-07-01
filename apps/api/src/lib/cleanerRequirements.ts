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
 * A cleaner has valid insurance when they are either:
 *  - actively enrolled in the Sweepr Coverage Program, or
 *  - covered by a personal policy that an admin approved ('active') and
 *    that has not passed its expiry date.
 */
export async function checkInsurance(sql: Sql, cleanerId: string): Promise<InsuranceCheck> {
  const rows = (await sql`
    SELECT coverage_type, policy_status, policy_expires_at, program_cancelled_at
    FROM cleaner_insurance WHERE cleaner_id = ${cleanerId} LIMIT 1
  `) as Array<{
    coverage_type: string;
    policy_status: string;
    policy_expires_at: string | null;
    program_cancelled_at: string | null;
  }>;
  const ins = rows[0];
  if (!ins) return { valid: false, reason: "none" };

  if (ins.coverage_type === "sweepr_program") {
    const active = ins.policy_status === "active" && !ins.program_cancelled_at;
    return { valid: active, reason: active ? "ok" : "none" };
  }

  // personal_policy
  if (ins.policy_status === "rejected") return { valid: false, reason: "rejected" };
  if (ins.policy_status !== "active" && ins.policy_status !== "expiring_soon") {
    return { valid: false, reason: "pending_review" };
  }
  if (ins.policy_expires_at && new Date(ins.policy_expires_at) < new Date()) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, reason: "ok" };
}
