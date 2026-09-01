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
 * User-report notifications (Trust & Safety).
 *
 *  - Acknowledgment to the reporter when their report is submitted.
 *  - Resolution notice to the reporter when an admin closes the investigation.
 *
 * DELIBERATELY NOTHING to the reported party: they are never emailed by this
 * system, and resolution wording never reveals what action (if any) was taken
 * against the other account. All sends are best-effort — a mail failure never
 * blocks a submission or an admin decision.
 */

import type { Sql } from "./db";
import type { Env } from "../types";
import { logger } from "./logger";
import { sendEmail, wrapBodyInTemplate, SENDERS } from "./mailer";
import { reportReference } from "./userReports";

function bookingLink(env: Env, reporterRole: "customer" | "cleaner", bookingId: string): string {
  return reporterRole === "cleaner"
    ? `${env.CLEANER_APP_URL ?? "https://clean.getsweepr.com"}/jobs/${bookingId}`
    : `${env.CUSTOMER_URL ?? "https://app.getsweepr.com"}/bookings/${bookingId}`;
}

export interface ReporterInfo {
  email: string | null;
  firstName: string | null;
  reporterRole: "customer" | "cleaner";
  bookingId: string;
  reportId: string;
}

/** "We received your report" — sent to the reporter on submission. */
export async function sendReportAcknowledgment(
  sql: Sql,
  env: Env,
  info: ReporterInfo,
): Promise<void> {
  if (!env.MAILERSEND_API_KEY || !info.email) return;
  const ref = reportReference(info.reportId);
  const subject = `We received your report (${ref})`;
  const greeting = info.firstName ? `Hi ${info.firstName},` : "Hello,";
  const body = [
    greeting,
    `Thank you for letting us know. We received your report and opened case ${ref}.`,
    "Our Trust and Safety team will review the details and any photos you provided. Reviews are handled carefully and treated as confidential. If we need more information, we will contact you at this email address.",
    "You can check the status of your report from the booking page at any time. We will email you again once the review is complete.",
  ].join("\n\n");

  try {
    await sendEmail(
      env.MAILERSEND_API_KEY,
      {
        to: info.email,
        subject,
        html: wrapBodyInTemplate(subject, body, undefined, {
          preheader: `Case ${ref} is open and under review.`,
          cta: { label: "View booking", url: bookingLink(env, info.reporterRole, info.bookingId) },
        }),
        from: SENDERS.SUPPORT,
        replyTo: SENDERS.SUPPORT,
        relatedType: "user_report",
        relatedId: info.reportId,
        templateName: "user_report_acknowledgment",
      },
      sql,
    );
  } catch (err) {
    logger.error("userReport.ack email failed", err, { reportId: info.reportId });
  }
}

/**
 * Resolution notice to the reporter. Wording is deliberately neutral: we
 * confirm the review is complete and, when action was taken, say only that
 * appropriate action was taken — never what happened to the other account.
 */
export async function sendReportResolutionNotice(
  sql: Sql,
  env: Env,
  info: ReporterInfo & { outcome: "action_taken" | "dismissed" },
): Promise<void> {
  if (!env.MAILERSEND_API_KEY || !info.email) return;
  const ref = reportReference(info.reportId);
  const subject = `Your report ${ref} has been reviewed`;
  const greeting = info.firstName ? `Hi ${info.firstName},` : "Hello,";

  const outcomeCopy =
    info.outcome === "action_taken"
      ? "Our Trust and Safety team has completed its review of your report. Based on what we found, we have taken appropriate action in line with our policies. To protect the privacy of everyone involved, we do not share details about steps applied to another account."
      : "Our Trust and Safety team has completed its review of your report. After looking carefully at the information available, we were not able to confirm a policy violation, and the case is now closed. If new information comes up, you are welcome to contact support.";

  const body = [
    greeting,
    outcomeCopy,
    "Thank you for taking the time to report this. Reports like yours help keep Sweepr safe for customers and cleaners alike.",
  ].join("\n\n");

  try {
    await sendEmail(
      env.MAILERSEND_API_KEY,
      {
        to: info.email,
        subject,
        html: wrapBodyInTemplate(subject, body, undefined, {
          preheader: `Case ${ref} review is complete.`,
          cta: { label: "View booking", url: bookingLink(env, info.reporterRole, info.bookingId) },
        }),
        from: SENDERS.SUPPORT,
        replyTo: SENDERS.SUPPORT,
        relatedType: "user_report",
        relatedId: info.reportId,
        templateName: "user_report_resolution",
      },
      sql,
    );
  } catch (err) {
    logger.error("userReport.resolution email failed", err, { reportId: info.reportId });
  }
}
