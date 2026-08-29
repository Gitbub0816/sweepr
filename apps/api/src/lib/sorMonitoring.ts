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
 * Automatic Sex Offender Registry (SOR) continuous-monitoring enrollment.
 *
 * The moment a cleaner's background check is APPROVED (yardstik_status becomes
 * 'clear'), we order Yardstik's ongoing SOR monitoring package against the
 * SAME candidate. It runs once per cleaner and is fully idempotent, so it is
 * safe to call from every approval path (webhook auto-engage, webhook direct
 * clear, admin manual adjudication) — repeat calls no-op.
 */

import type { Sql } from "@sweepr/db";
import type { Env } from "../types";
import { yardstikClient } from "./yardstik";
import { logger } from "./logger";

/**
 * Enroll a just-approved cleaner in continuous SOR monitoring, exactly once.
 *
 * No-ops (returns silently) when: no SOR monitoring package is configured, the
 * cleaner has no Yardstik candidate on file, or enrollment was already
 * claimed/completed. Uses claim-then-act (convention 3): the row is claimed by
 * stamping yardstik_sor_monitor_enrolled_at BEFORE the Yardstik call, so two
 * concurrent approval webhooks cannot double-order. A failed order releases the
 * claim so a later approval can retry.
 */
export async function enrollSorMonitoringIfApproved(
  sql: Sql,
  env: Env,
  cleanerId: string,
): Promise<void> {
  // Feature gate: without a configured SOR monitoring package id, do nothing.
  // This keeps the integration inert until the owner sets the secret.
  if (!env.YARDSTIK_SOR_MONITOR_PACKAGE_ID?.trim()) return;

  let candidateId: string | null;
  try {
    // Claim the row: only the first approval that flips enrolled_at from NULL
    // wins and proceeds to order the monitor. Requires a candidate on file.
    const claimed = (await sql`
      UPDATE cleaners
      SET yardstik_sor_monitor_enrolled_at = NOW()
      WHERE id = ${cleanerId}
        AND yardstik_candidate_id IS NOT NULL
        AND yardstik_sor_monitor_enrolled_at IS NULL
      RETURNING yardstik_candidate_id
    `) as { yardstik_candidate_id: string | null }[];
    candidateId = claimed[0]?.yardstik_candidate_id ?? null;
    if (!candidateId) return; // already enrolled/in-flight, or no candidate
  } catch (err) {
    logger.error("SOR monitor: claim failed", err, { cleanerId });
    return;
  }

  try {
    const client = yardstikClient(env);
    const report = await client.createMonitorReport(candidateId, cleanerId);
    await sql`
      UPDATE cleaners
      SET yardstik_sor_monitor_report_id = ${report.id}
      WHERE id = ${cleanerId}
    `;
    logger.info("SOR monitor: enrolled", { cleanerId, reportId: report.id });
  } catch (err) {
    // Release the claim so a subsequent approval event can retry enrollment.
    await sql`
      UPDATE cleaners
      SET yardstik_sor_monitor_enrolled_at = NULL
      WHERE id = ${cleanerId}
        AND yardstik_sor_monitor_report_id IS NULL
    `.catch(() => {});
    logger.error("SOR monitor: enrollment order failed", err, { cleanerId });
  }
}
