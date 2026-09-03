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
 * checkInsurance — the gate a cleaner passes before accepting jobs.
 *
 * Sweepr does not provide insurance. The withdrawn "Sweepr Coverage Program"
 * wrote rows with coverage_type 'sweepr_program' and policy_status 'active'
 * without any insurer behind them, so the load-bearing case here is that such
 * a row does NOT let a cleaner accept work: only their own admin-approved,
 * unexpired policy counts.
 */
import { describe, it, expect } from "vitest";
import { checkInsurance } from "../src/lib/cleanerRequirements";
import type { Sql } from "../src/lib/db";

function sqlReturning(row: Record<string, unknown> | null): Sql {
  return ((..._args: unknown[]) => Promise.resolve(row ? [row] : [])) as unknown as Sql;
}

const future = new Date(Date.now() + 90 * 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe("checkInsurance", () => {
  it("a legacy 'sweepr_program' enrollment is NOT coverage, even marked active", async () => {
    const res = await checkInsurance(
      sqlReturning({ coverage_type: "sweepr_program", policy_status: "active", policy_expires_at: null }),
      "cleaner-1",
    );
    expect(res).toEqual({ valid: false, reason: "none" });
  });

  it("no record at all is not coverage", async () => {
    expect(await checkInsurance(sqlReturning(null), "cleaner-1")).toEqual({ valid: false, reason: "none" });
  });

  it("an approved, unexpired personal policy is coverage", async () => {
    const res = await checkInsurance(
      sqlReturning({ coverage_type: "personal_policy", policy_status: "active", policy_expires_at: future }),
      "cleaner-1",
    );
    expect(res).toEqual({ valid: true, reason: "ok" });
  });

  it("an expiring-soon policy still counts until it actually expires", async () => {
    const res = await checkInsurance(
      sqlReturning({ coverage_type: "personal_policy", policy_status: "expiring_soon", policy_expires_at: future }),
      "cleaner-1",
    );
    expect(res.valid).toBe(true);
  });

  it("distinguishes rejected, unreviewed, and expired policies", async () => {
    expect(
      await checkInsurance(
        sqlReturning({ coverage_type: "personal_policy", policy_status: "rejected", policy_expires_at: future }),
        "c",
      ),
    ).toEqual({ valid: false, reason: "rejected" });

    expect(
      await checkInsurance(
        sqlReturning({ coverage_type: "personal_policy", policy_status: "pending_review", policy_expires_at: future }),
        "c",
      ),
    ).toEqual({ valid: false, reason: "pending_review" });

    expect(
      await checkInsurance(
        sqlReturning({ coverage_type: "personal_policy", policy_status: "active", policy_expires_at: past }),
        "c",
      ),
    ).toEqual({ valid: false, reason: "expired" });
  });
});
